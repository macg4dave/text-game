import { SYSTEM_PROMPT } from "../ai/prompt.js";
import { generateTurn, getEmbedding, getEmbeddings } from "../ai/service.js";
import {
  LIVE_CONTEXT_BUCKET_LIMITS,
  DEFAULT_RULESET_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalTurnEventPayload,
  type DirectorSpec,
  type LiveTurnContext,
  type MemoryInsert,
  type MemorySummaryArtifact,
  type Player,
  type QuestSpec,
  type TurnOutputPayload,
  type ValidationResult
} from "../core/types.js";
import {
  addCommittedTurnEvent,
  addEvent,
  addMemories,
  getMemorySummaryArtifacts,
  getOrCreatePlayer,
  getNpcEncounterFacts,
  getNpcMemoryRecords,
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
import {
  buildNpcMemoryRecord,
  createNpcEncounterFactMemoryInsert,
  createNpcLongLivedMemoryInsert,
  deriveNpcEncounterFacts,
  type DeriveNpcEncounterFactsParams,
  evaluateNpcEncounterSignificance
} from "./encounter-facts.js";
import {
  buildBeatRecapArtifact,
  buildSceneSummaryArtifact,
  createMemorySummaryArtifactInsert
} from "./memory-summary.js";
import {
  applyMemoryEmbeddings,
  prepareMemoryEmbeddingInputs
} from "./memory-embeddings.js";
import { sanitizeTurnResult } from "./turn-result.js";
import { getCurrentBeat } from "../story/director.js";
import { classifyTurnInput, freezesTurnProgress } from "../rules/turn-input-classification.js";
import { validateStateUpdates, validateTurnOutput } from "../rules/validator.js";
import { tryResolveSceneGroundingTurn } from "./scene-grounding.js";
import { resolveSimulationStateUpdates } from "./simulation.js";

export interface TurnExecutionTrace {
  input: string;
  player: Player | null;
  refreshedPlayer: Player | null;
  committedEvent: CanonicalTurnEventPayload | null;
  liveContext: LiveTurnContext | null;
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
  deriveNpcEncounterFacts: (params: DeriveNpcEncounterFactsParams) => Awaited<ReturnType<typeof deriveNpcEncounterFacts>> | Promise<Awaited<ReturnType<typeof deriveNpcEncounterFacts>>>;
  generateTurn: typeof generateTurn;
  getEmbedding: typeof getEmbedding;
  getEmbeddings: typeof getEmbeddings;
  getNpcEncounterFacts: typeof getNpcEncounterFacts;
  getNpcMemoryRecords: typeof getNpcMemoryRecords;
  getMemorySummaryArtifacts: typeof getMemorySummaryArtifacts;
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
    liveContext: null,
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
    deriveNpcEncounterFacts,
    generateTurn,
    getEmbedding,
    getEmbeddings,
    getNpcEncounterFacts,
    getNpcMemoryRecords,
    getMemorySummaryArtifacts,
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
      let usedSceneGrounding = false;

      try {
        deps.addEvent(player.id, "player", input);
        trace.shortHistory = deps.getShortHistory(player.id, 6);

        const groundedTurn = tryResolveSceneGroundingTurn({
          player,
          input,
          shortHistory: trace.shortHistory
        });

        if (groundedTurn) {
          usedSceneGrounding = true;
          trace.rawResult = {
            ...groundedTurn,
            state_updates: resolveSimulationStateUpdates({
              player,
              proposed: groundedTurn.state_updates,
              questSpec
            })
          };
        } else {
          try {
            trace.inputEmbedding = await deps.getEmbedding({ model: embeddingModel, input });
          } catch (error) {
            trace.inputEmbedding = [];
            trace.inputEmbeddingError = getErrorMessage(error);
          }

          trace.liveContext = createLiveTurnContext({
            player,
            shortHistory: deps.getShortHistory(player.id, 6),
            recalledMemories: deps.getRelevantMemories(player.id, trace.inputEmbedding, 6)
          });
          trace.shortHistory = trace.liveContext.buckets.short_history;
          trace.memories = trace.liveContext.recalled_facts;
          trace.statePack = createStatePack(player, directorSpec, questSpec);

          trace.rawResult = await deps.generateTurn({
            model,
            systemPrompt,
            statePack: trace.statePack,
            shortHistory: trace.shortHistory,
            memories: trace.memories,
            liveContext: trace.liveContext,
            input
          });
        }

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
        const hasCommittedContent = hasCommittedSummaryArtifactContent(acceptedConsequences);
        const reducedState = reduceCommittedPlayerState({
          player,
          acceptedConsequences,
          resolvedDirectorState: directorState
        });

        trace.result = reconcileTurnPresentation({
          player,
          input,
          proposedTurnOutput: trace.proposedResult,
          acceptedConsequences,
          nextPlayer: reducedState.player
        });

        deps.addEvent(player.id, "narrator", trace.result.narrative);
        deps.persistPlayerState(reducedState.player);

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

        const pendingMemoryInserts: MemoryInsert[] = [];
        if (acceptedConsequences.memory_updates.length) {
          pendingMemoryInserts.push(
            ...acceptedConsequences.memory_updates.map((content) => ({
              content,
              kind: "fact" as const
            }))
          );
        }

        const derivedEncounterFacts = (hasCommittedContent || !usedSceneGrounding)
          ? await deps.deriveNpcEncounterFacts({
              player,
              nextPlayer: reducedState.player,
              input,
              turnOutput: trace.result,
              acceptedConsequences,
              sourceEventId: trace.committedEvent.event_id,
              occurredAt: trace.committedEvent.occurred_at
            })
          : [];
        if (derivedEncounterFacts.length) {
          const encounterMemoryInserts = derivedEncounterFacts.flatMap((fact) => {
            const previousFacts = deps.getNpcEncounterFacts(player.id, fact.npc_id);
            const previousRecord = deps.getNpcMemoryRecords(player.id, fact.npc_id, 1)[0] ?? null;
            const significance = evaluateNpcEncounterSignificance({
              fact,
              previousFacts,
              voluntaryReturn: previousFacts.length > 0
            });
            const scoredFact = {
              ...fact,
              encounter_count: Math.max(fact.encounter_count, previousFacts.length + 1),
              significance: significance.score
            };
            const npcMemoryRecord = buildNpcMemoryRecord({
              fact: scoredFact,
              previousRecord,
              previousFacts,
              voluntaryReturn: previousFacts.length > 0
            });

            return npcMemoryRecord.tier !== "ambient"
              ? [
                  createNpcEncounterFactMemoryInsert(scoredFact),
                  createNpcLongLivedMemoryInsert(npcMemoryRecord)
                ]
              : [createNpcEncounterFactMemoryInsert(scoredFact)];
          });

          if (encounterMemoryInserts.length) {
            pendingMemoryInserts.push(...encounterMemoryInserts);
          }
        }

        if (trace.committedEvent && hasCommittedContent) {
          const summaryArtifacts: MemorySummaryArtifact[] = [];
          const sceneSummaryArtifact = buildSceneSummaryArtifact({
            player,
            nextPlayer: reducedState.player,
            event: trace.committedEvent
          });
          summaryArtifacts.push(sceneSummaryArtifact);

          if (player.director_state.current_beat_id !== reducedState.player.director_state.current_beat_id) {
            const previousSceneArtifacts = deps.getMemorySummaryArtifacts(player.id, {
              artifactKind: "scene-summary",
              beatId: player.director_state.current_beat_id,
              limit: 12
            });
            summaryArtifacts.push(
              buildBeatRecapArtifact({
                player,
                sceneArtifacts: [...previousSceneArtifacts.reverse(), sceneSummaryArtifact],
                generatedAt: trace.committedEvent.occurred_at
              })
            );
          }

          pendingMemoryInserts.push(
            ...summaryArtifacts.map((artifact) => createMemorySummaryArtifactInsert(artifact))
          );
        }

        if (pendingMemoryInserts.length) {
          let memoryInsertsWithEmbeddings = pendingMemoryInserts;
          const preparedMemoryInputs = prepareMemoryEmbeddingInputs(pendingMemoryInserts);

          if (preparedMemoryInputs.length) {
            try {
              trace.memoryEmbeddings = await deps.getEmbeddings({
                model: embeddingModel,
                inputs: preparedMemoryInputs.map((item) => item.input)
              });
              memoryInsertsWithEmbeddings = applyMemoryEmbeddings(
                pendingMemoryInserts,
                preparedMemoryInputs,
                trace.memoryEmbeddings
              );
            } catch (error) {
              trace.memoryEmbeddings = [];
              trace.memoryEmbeddingError = getErrorMessage(error);
            }
          }

          deps.addMemories(player.id, memoryInsertsWithEmbeddings);
        }

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

function hasCommittedSummaryArtifactContent(
  committed: CanonicalTurnEventPayload["committed"]
): boolean {
  return Boolean(
    committed.state_updates ||
    committed.director_updates ||
    committed.memory_updates.length
  );
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

function createLiveTurnContext({
  player,
  shortHistory,
  recalledMemories
}: {
  player: Player;
  shortHistory: string[];
  recalledMemories: string[];
}): LiveTurnContext {
  const budgets: LiveTurnContext["budgets"] = {
    short_history: {
      bucket: "short_history",
      limit: LIVE_CONTEXT_BUCKET_LIMITS.short_history,
      include_by_default: true
    },
    quest_progress: {
      bucket: "quest_progress",
      limit: LIVE_CONTEXT_BUCKET_LIMITS.quest_progress,
      include_by_default: true
    },
    relationship_summaries: {
      bucket: "relationship_summaries",
      limit: LIVE_CONTEXT_BUCKET_LIMITS.relationship_summaries,
      include_by_default: true
    },
    world_facts: {
      bucket: "world_facts",
      limit: LIVE_CONTEXT_BUCKET_LIMITS.world_facts,
      include_by_default: true
    },
    cold_history: {
      bucket: "cold_history",
      limit: LIVE_CONTEXT_BUCKET_LIMITS.cold_history,
      include_by_default: false
    }
  };

  const bucketedHistory = shortHistory.slice(-budgets.short_history.limit);
  const questProgress = [
    ...player.quests.map((quest) => `QUEST: ${quest.summary}`),
    `GOAL: ${player.director_state.end_goal_progress}`
  ].filter(Boolean).slice(0, budgets.quest_progress.limit);

  const relationshipSummaries = recalledMemories
    .filter((memory) => !/^(PLAYER|NARRATOR):/i.test(memory.trim()))
    .filter((memory) => /^[A-Z][^:\n]{1,80}:/.test(memory.trim()))
    .slice(0, budgets.relationship_summaries.limit);

  const coldHistory = recalledMemories
    .filter((memory) => /^(PLAYER|NARRATOR):/i.test(memory.trim()))
    .slice(0, budgets.cold_history.limit);

  const worldFacts = recalledMemories
    .filter((memory) => !relationshipSummaries.includes(memory) && !/^(PLAYER|NARRATOR):/i.test(memory.trim()))
    .slice(0, budgets.world_facts.limit);

  return {
    budgets,
    buckets: {
      short_history: bucketedHistory,
      quest_progress: questProgress,
      relationship_summaries: relationshipSummaries,
      world_facts: worldFacts,
      cold_history: coldHistory
    },
    recalled_facts: [...relationshipSummaries, ...questProgress, ...worldFacts]
  };
}
