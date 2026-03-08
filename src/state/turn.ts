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
  getRelevantMemories,
  getShortHistory,
  updateDirectorState,
  updatePlayerState,
  updateSummary
} from "./game.js";
import {
  createCommittedTurnEventPayload,
  summarizeAcceptedTurnOutcome,
  summarizeRejectedTurnOutcome
} from "./committed-event.js";
import { sanitizeTurnResult } from "./turn-result.js";
import { applyDirectorRules, getCurrentBeat } from "../story/director.js";
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
  applyDirectorRules: typeof applyDirectorRules;
  generateTurn: typeof generateTurn;
  getEmbedding: typeof getEmbedding;
  getEmbeddings: typeof getEmbeddings;
  getOrCreatePlayer: typeof getOrCreatePlayer;
  getRelevantMemories: typeof getRelevantMemories;
  getShortHistory: typeof getShortHistory;
  sanitizeTurnResult: typeof sanitizeTurnResult;
  updateDirectorState: typeof updateDirectorState;
  updatePlayerState: typeof updatePlayerState;
  updateSummary: typeof updateSummary;
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
    applyDirectorRules,
    generateTurn,
    getEmbedding,
    getEmbeddings,
    getOrCreatePlayer,
    getRelevantMemories,
    getShortHistory,
    sanitizeTurnResult,
    updateDirectorState,
    updatePlayerState,
    updateSummary,
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

        trace.result = {
          schema_version: TURN_OUTPUT_SCHEMA_VERSION,
          ...deps.sanitizeTurnResult(trace.rawResult, player)
        };

        const turnOutputValidation = deps.validateTurnOutput(trace.result);
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

        trace.updateValidation = deps.validateStateUpdates(trace.result.state_updates);
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
                narrative: trace.result.narrative,
                player_options: trace.result.player_options
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

        deps.addEvent(player.id, "narrator", trace.result.narrative);
        deps.updatePlayerState(player.id, trace.result.state_updates);

        const nextFlags = mergeList(player.flags, trace.result.state_updates.flags_add, trace.result.state_updates.flags_remove);
        const directorState = deps.applyDirectorRules({
          spec: directorSpec,
          directorState: player.director_state,
          stateUpdates: trace.result.state_updates,
          flags: nextFlags
        });
        directorState.end_goal_progress = trace.result.director_updates.end_goal_progress;
        deps.updateDirectorState(player.id, directorState);

        if (trace.result.memory_updates.length) {
          try {
            trace.memoryEmbeddings = await deps.getEmbeddings({
              model: embeddingModel,
              inputs: trace.result.memory_updates
            });
          } catch (error) {
            trace.memoryEmbeddings = [];
            trace.memoryEmbeddingError = getErrorMessage(error);
          }

          deps.addMemories(
            player.id,
            trace.result.memory_updates.map((content, index) => ({
              content,
              embedding: trace.memoryEmbeddings[index]
            }))
          );
          deps.updateSummary(player.id, trace.result.memory_updates);
        }

        trace.committedEvent = createCommittedTurnEventPayload({
          playerId: player.id,
          input,
          outcome: {
            status: "accepted",
            summary: summarizeAcceptedTurnOutcome(trace.result),
            rejection_reason: null
          },
          committed: {
            state_updates: trace.result.state_updates,
            director_updates: trace.result.director_updates,
            memory_updates: trace.result.memory_updates
          },
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

function mergeList(existing: string[], addList: string[] = [], removeList: string[] = []): string[] {
  const set = new Set(existing);
  addList.forEach((item) => set.add(item));
  removeList.forEach((item) => set.delete(item));
  return Array.from(set);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
