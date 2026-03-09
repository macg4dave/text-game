import crypto from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type { Logger } from "../core/logging.js";
import type {
  DirectorSpec,
  QuestSpec,
  RuntimePreflightIssue,
  TurnOutputPayload
} from "../core/types.js";
import { getOrCreatePlayer, updateDirectorState } from "../state/game.js";
import { createTurnExecutionTrace, turnService, type TurnService } from "../state/turn.js";
import { parseTurnInput, validateTurnResponse } from "../rules/validator.js";
import type { RuntimePreflightService } from "./runtime-preflight.js";
import { normalizeDirectorState } from "./player-state.js";
import { createAuthoritativePlayerState, createTurnResponsePayload } from "./http-contract.js";
import { getErrorMessage } from "./request-utils.js";

interface TurnRouteDependencies {
  runtimePreflight: RuntimePreflightService;
  ensureDatabaseReady: () => RuntimePreflightIssue | null;
  getRequestLogger: (res: Response) => Logger;
  buildTurnDebugPayload: (params: {
    requestId: string;
    startedAt: number;
    input: string;
    player: ReturnType<typeof getOrCreatePlayer> | null;
    refreshedPlayer: ReturnType<typeof getOrCreatePlayer> | null;
    shortHistory: string[];
    memories: string[];
    statePack: unknown;
    inputEmbedding: number[];
    inputEmbeddingError: string | null;
    rawResult: unknown;
    proposedResult: TurnOutputPayload | null;
    result: TurnOutputPayload | null;
    updateValidation: { ok: boolean; errors: string[] };
    memoryEmbeddings: number[][];
    memoryEmbeddingError: string | null;
    error?: string | null;
  }) => unknown;
  model: string;
  embeddingModel: string;
  getDirectorSpec: () => DirectorSpec;
  getQuestSpec: () => QuestSpec;
  getOrCreatePlayer?: typeof getOrCreatePlayer;
  updateDirectorState?: typeof updateDirectorState;
  turnExecutionService?: TurnService;
}

export function createTurnHandler({
  runtimePreflight,
  ensureDatabaseReady,
  getRequestLogger,
  buildTurnDebugPayload,
  model,
  embeddingModel,
  getDirectorSpec,
  getQuestSpec,
  getOrCreatePlayer: getOrCreatePlayerForRoute = getOrCreatePlayer,
  updateDirectorState: updateDirectorStateForRoute = updateDirectorState,
  turnExecutionService = turnService
}: TurnRouteDependencies): RequestHandler {
  return async (req: Request, res: Response) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    let trace = createTurnExecutionTrace();

    const requestLogger = getRequestLogger(res).child({ turnRequestId: requestId });
    res.setHeader("x-request-id", requestId);

    try {
      const turnInput = parseTurnInput(req.body);
      if (!turnInput.ok || !turnInput.value) {
        requestLogger.warn("turn request rejected", { reason: "missing_input" });
        return res.status(400).json({
          error: "Invalid turn input",
          detail: turnInput.errors,
          debug: buildTurnDebugPayload({
            requestId,
            startedAt,
            ...trace
          })
        });
      }

      trace.input = turnInput.value.input;

      const preflight = await runtimePreflight.ensureReport();
      if (!preflight.ok) {
        requestLogger.warn("turn blocked by startup preflight", {
          blockerCount: preflight.counts.blocker,
          warningCount: preflight.counts.warning
        });
        return res.status(503).json({
          error: "Setup required",
          detail: preflight.issues.map((issue) => `${issue.title}: ${issue.message}`),
          debug: buildTurnDebugPayload({
            requestId,
            startedAt,
            ...trace,
            error: preflight.summary
          })
        });
      }

      const dbIssue = ensureDatabaseReady();
      if (dbIssue) {
        const refreshedPreflight = await runtimePreflight.ensureReport({ force: true });
        requestLogger.warn("turn blocked by storage startup preflight", {
          blockerCount: refreshedPreflight.counts.blocker,
          warningCount: refreshedPreflight.counts.warning
        });
        return res.status(503).json({
          error: "Setup required",
          detail: refreshedPreflight.issues.map((issue) => `${issue.title}: ${issue.message}`),
          debug: buildTurnDebugPayload({
            requestId,
            startedAt,
            ...trace,
            error: refreshedPreflight.summary
          })
        });
      }

      const player = getOrCreatePlayerForRoute({ playerId: turnInput.value.player_id, name: turnInput.value.player_name });
      const directorSpec = getDirectorSpec();
      const normalized = normalizeDirectorState(player, directorSpec);
      if (normalized.changed) {
        updateDirectorStateForRoute(player.id, normalized.director);
        player.director_state = normalized.director;
      }

      const execution = await turnExecutionService.executeTurn({
        player,
        input: turnInput.value.input,
        model,
        embeddingModel,
        directorSpec,
        questSpec: getQuestSpec()
      });
      trace = execution.trace;

      if (!execution.ok) {
        if (execution.reason === "turn_output_validation" || execution.reason === "state_update_validation") {
          requestLogger.warn(
            execution.reason === "turn_output_validation"
              ? "turn rejected after output schema validation"
              : "turn rejected after validation",
            {
              validationErrors: execution.detail
            }
          );
        } else {
          requestLogger.error("turn failed", { error: execution.cause, durationMs: Date.now() - startedAt });
        }

        return res.status(execution.statusCode).json({
          error: execution.error,
          detail: execution.detail,
          debug: buildTurnDebugPayload({
            requestId,
            startedAt,
            ...trace,
            error: execution.reason === "unexpected" ? String(execution.detail) : undefined
          })
        });
      }

      const authoritativePlayer = createAuthoritativePlayerState(execution.refreshedPlayer);
      const turnResponse = createTurnResponsePayload(execution.turnOutput, authoritativePlayer);
      const turnResponseValidation = validateTurnResponse(turnResponse);
      if (!turnResponseValidation.ok) {
        requestLogger.error("turn produced invalid response payload", {
          validationErrors: turnResponseValidation.errors
        });
        return res.status(500).json({
          error: "Invalid turn response",
          detail: turnResponseValidation.errors,
          debug: buildTurnDebugPayload({
            requestId,
            startedAt,
            ...trace
          })
        });
      }

      requestLogger.info("turn completed", {
        durationMs: Date.now() - startedAt,
        inputEmbeddingFallback: Boolean(trace.inputEmbeddingError),
        memoryEmbeddingFallback: Boolean(trace.memoryEmbeddingError),
        suggestedOptionCount: execution.turnOutput.player_options.length,
        memoryUpdateCount: execution.turnOutput.memory_updates.length
      });

      return res.json({
        ...turnResponse,
        debug: buildTurnDebugPayload({
          requestId,
          startedAt,
          ...trace
        })
      });
    } catch (error) {
      requestLogger.error("turn failed", { error, durationMs: Date.now() - startedAt });
      return res.status(500).json({
        error: "Turn failed",
        detail: getErrorMessage(error),
        debug: buildTurnDebugPayload({
          requestId,
          startedAt,
          ...trace,
          error: getErrorMessage(error)
        })
      });
    }
  };
}
