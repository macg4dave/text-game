import { SYSTEM_PROMPT } from "../ai/prompt.js";
import { generateTurn, getEmbedding, getEmbeddings } from "../ai/service.js";
import {
  DEFAULT_RULESET_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalTurnEventPayload,
  type DirectorSpec,
  type Player,
  type QuestSpec,
  type TurnOutputPayload,
  type ValidationResult
} from "../core/types.js";
import {
  addCommittedTurnEvent,
  addEvent,
  addMemories,
  getOrCreatePlayer,
  persistPlayerState,
  getRelevantMemories,
  getShortHistory
} from "./game.js";
import {
  createCommittedTurnEventPayload,
  summarizeAcceptedTurnOutcome,
  summarizeRejectedTurnOutcome
} from "./committed-event.js";
import { adjudicateTurnOutput } from "./adjudication.js";
import { reconcileTurnPresentation } from "./presentation.js";
import { reduceCommittedPlayerState } from "./reducer.js";
import { sanitizeTurnResult } from "./turn-result.js";
import { getCurrentBeat } from "../story/director.js";
import { classifyTurnInput, freezesTurnProgress } from "../rules/turn-input-classification.js";
import { validateStateUpdates, validateTurnOutput } from "../rules/validator.js";

export interface TurnExecutionTrace {
  input: string;
  player: Player | null;
  refreshedPlayer: Player | null;
  committedEvent: CanonicalTurnEventPayload | null;
  shortHistory: string[];
  memories: string[];
  statePack: unknown;
  inputEmbedding: number[];
  inputEmbeddingError: string | null;
  rawResult: unknown;
  proposedResult: TurnOutputPayload | null;
  result: TurnOutputPayload | null;
  updateValidation: ValidationResult<string>;
  memoryEmbeddings: number[][];
  memoryEmbeddingError: string | null;
}

export interface TurnExecutionSuccess {
  ok: true;
  refreshedPlayer: Player;
  turnOutput: TurnOutputPayload;
  trace: TurnExecutionTrace;
}

export interface TurnExecutionFailure {
  ok: false;
  statusCode: 400 | 500;
  error: string;
  detail: string | string[];
  reason: "turn_output_validation" | "state_update_validation" | "unexpected";
  cause?: unknown;
  trace: TurnExecutionTrace;
}

export type TurnExecutionOutcome = TurnExecutionSuccess | TurnExecutionFailure;

export interface ExecuteTurnParams {
  player: Player;
  input: string;
  model: string;
  embeddingModel: string;
  directorSpec: DirectorSpec;
  questSpec: QuestSpec;
  systemPrompt?: string;
}

export interface TurnService {
  executeTurn(params: ExecuteTurnParams): Promise<TurnExecutionOutcome>;
}

export interface TurnServiceDependencies {
  addCommittedTurnEvent: typeof addCommittedTurnEvent;
  addEvent: typeof addEvent;
  addMemories: typeof addMemories;
  adjudicateTurnOutput: typeof adjudicateTurnOutput;
  generateTurn: typeof generateTurn;
  getEmbedding: typeof getEmbedding;
  getEmbeddings: typeof getEmbeddings;
  getOrCreatePlayer: typeof getOrCreatePlayer;
  getRelevantMemories: typeof getRelevantMemories;
  getShortHistory: typeof getShortHistory;
  persistPlayerState: typeof persistPlayerState;
  sanitizeTurnResult: typeof sanitizeTurnResult;
  validateStateUpdates: typeof validateStateUpdates;
  validateTurnOutput: typeof validateTurnOutput;
}

export function createTurnExecutionTrace(input = ""): TurnExecutionTrace {
  return {
    input,
    player: null,
    refreshedPlayer: null,
    committedEvent: null,
    shortHistory: [],
    memories: [],
    statePack: null,
    inputEmbedding: [],
    inputEmbeddingError: null,
    rawResult: null,
    proposedResult: null,
    result: null,
    updateValidation: { ok: true, errors: [] },
    memoryEmbeddings: [],
    memoryEmbeddingError: null
  };
}

export function createTurnService(overrides: Partial<TurnServiceDependencies> = {}): TurnService {
  const deps: TurnServiceDependencies = {
    addCommittedTurnEvent,
    addEvent,
    addMemories,
    adjudicateTurnOutput,
    generateTurn,
    getEmbedding,
    getEmbeddings,
    getOrCreatePlayer,
    getRelevantMemories,
    getShortHistory,
    persistPlayerState,
    sanitizeTurnResult,
    validateStateUpdates,
    validateTurnOutput,
    ...overrides
  };

  return {
    async executeTurn({
      player,
      input,
      model,
      embeddingModel,
      directorSpec,
      questSpec,
      systemPrompt = SYSTEM_PROMPT
    }: ExecuteTurnParams): Promise<TurnExecutionOutcome> {
      const trace = createTurnExecutionTrace(input);
      trace.player = player;
      const inputClassification = classifyTurnInput(input);

      try {
        deps.addEvent(player.id, "player", input);
        trace.shortHistory = deps.getShortHistory(player.id, 6);

        try {
          trace.inputEmbedding = await deps.getEmbedding({ model: embeddingModel, input });
        } catch (error) {
          trace.inputEmbedding = [];
          trace.inputEmbeddingError = getErrorMessage(error);
        }

        trace.memories = deps.getRelevantMemories(player.id, trace.inputEmbedding, 6);
        trace.statePack = createStatePack(player, directorSpec, questSpec);

        trace.rawResult = await deps.generateTurn({
          model,
          systemPrompt,
          statePack: trace.statePack,
          shortHistory: trace.shortHistory,
          memories: trace.memories,
          input
        });

        const sanitizedResult = {
          schema_version: TURN_OUTPUT_SCHEMA_VERSION,
          ...deps.sanitizeTurnResult(trace.rawResult, player)
        };
        trace.proposedResult = sanitizedResult as TurnOutputPayload;

        const turnOutputValidation = deps.validateTurnOutput(sanitizedResult);
        if (!turnOutputValidation.ok) {
          trace.committedEvent = createCommittedTurnEventPayload({
            playerId: player.id,
            input,
            outcome: {
              status: "rejected",
              summary: summarizeRejectedTurnOutcome("turn_output_validation"),
              rejection_reason: "turn_output_validation"
            },
            committed: {
              state_updates: null,
              director_updates: null,
              memory_updates: []
            },
            rulesetVersion: DEFAULT_RULESET_VERSION,
            supplemental: {
              transcript: {
                player_text: input,
                narrator_text: null
              },
              presentation: {
                narrative: null,
                player_options: []
              },
              prompt: {
                model
              }
            }
          });
          deps.addCommittedTurnEvent(trace.committedEvent);
          return {
            ok: false,
            statusCode: 400,
            error: "Invalid turn output",
            detail: turnOutputValidation.errors,
            reason: "turn_output_validation",
            trace
          };
        }

        trace.proposedResult = sanitizedResult as TurnOutputPayload;

        trace.updateValidation = deps.validateStateUpdates(trace.proposedResult.state_updates);
        if (!trace.updateValidation.ok) {
          trace.committedEvent = createCommittedTurnEventPayload({
            playerId: player.id,
            input,
            outcome: {
              status: "rejected",
              summary: summarizeRejectedTurnOutcome("state_update_validation"),
              rejection_reason: "state_update_validation"
            },
            committed: {
              state_updates: null,
              director_updates: null,
              memory_updates: []
            },
            rulesetVersion: DEFAULT_RULESET_VERSION,
            supplemental: {
              transcript: {
                player_text: input,
                narrator_text: null
              },
              presentation: {
                narrative: trace.proposedResult.narrative,
                player_options: trace.proposedResult.player_options
              },
              prompt: {
                model
              }
            }
          });
          deps.addCommittedTurnEvent(trace.committedEvent);
          return {
            ok: false,
            statusCode: 400,
            error: "Invalid state updates",
            detail: trace.updateValidation.errors,
            reason: "state_update_validation",
            trace
          };
        }

        const adjudication = deps.adjudicateTurnOutput({
          player,
          turnOutput: freezesTurnProgress(inputClassification)
            ? freezeTurnProgression(trace.proposedResult, player)
            : trace.proposedResult,
          directorSpec,
          questSpec
        });
        const { acceptedConsequences, resolvedDirectorState: directorState } = adjudication;
        const reducedState = reduceCommittedPlayerState({
          player,
          acceptedConsequences,
          resolvedDirectorState: directorState
        });

        trace.result = reconcileTurnPresentation({
          player,
          proposedTurnOutput: trace.proposedResult,
          acceptedConsequences,
          nextPlayer: reducedState.player
        });

        deps.addEvent(player.id, "narrator", trace.result.narrative);
        deps.persistPlayerState(reducedState.player);

        if (acceptedConsequences.memory_updates.length) {
          try {
            trace.memoryEmbeddings = await deps.getEmbeddings({
              model: embeddingModel,
              inputs: acceptedConsequences.memory_updates
            });
          } catch (error) {
            trace.memoryEmbeddings = [];
            trace.memoryEmbeddingError = getErrorMessage(error);
          }

          deps.addMemories(
            player.id,
            acceptedConsequences.memory_updates.map((content, index) => ({
              content,
              embedding: trace.memoryEmbeddings[index]
            }))
          );
        }

        trace.committedEvent = createCommittedTurnEventPayload({
          playerId: player.id,
          input,
          outcome: {
            status: "accepted",
            summary: summarizeAcceptedTurnOutcome(acceptedConsequences),
            rejection_reason: null
          },
          committed: acceptedConsequences,
          rulesetVersion: DEFAULT_RULESET_VERSION,
          supplemental: {
            transcript: {
              player_text: input,
              narrator_text: trace.result.narrative
            },
            presentation: {
              narrative: trace.result.narrative,
              player_options: trace.result.player_options
            },
            proposal_presentation: {
              narrative: trace.proposedResult.narrative,
              player_options: trace.proposedResult.player_options
            },
            prompt: {
              model
            }
          }
        });
        deps.addCommittedTurnEvent(trace.committedEvent);

        trace.refreshedPlayer = deps.getOrCreatePlayer({ playerId: player.id });

        return {
          ok: true,
          refreshedPlayer: trace.refreshedPlayer,
          turnOutput: trace.result,
          trace
        };
      } catch (error) {
        return {
          ok: false,
          statusCode: 500,
          error: "Turn failed",
          detail: getErrorMessage(error),
          reason: "unexpected",
          cause: error,
          trace
        };
      }
    }
  };
}

export const turnService = createTurnService();

function createStatePack(player: Player, directorSpec: DirectorSpec, questSpec: QuestSpec) {
  return {
    player: {
      id: player.id,
      name: player.name,
      location: player.location,
      inventory: player.inventory,
      flags: player.flags,
      quests: player.quests
    },
    summary: player.summary,
    director: player.director_state,
    director_spec: {
      end_goal: directorSpec.end_goal,
      current_beat: getCurrentBeat(directorSpec, player.director_state),
      rules: directorSpec.rules
    },
    quest_spec: questSpec
  };
}

function freezeTurnProgression(turnOutput: TurnOutputPayload, player: Player): TurnOutputPayload {
  return {
    ...turnOutput,
    state_updates: {
      location: player.location,
      inventory_add: [],
      inventory_remove: [],
      flags_add: [],
      flags_remove: [],
      quests: []
    },
    director_updates: {
      end_goal_progress: player.director_state.end_goal_progress
    },
    memory_updates: []
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
