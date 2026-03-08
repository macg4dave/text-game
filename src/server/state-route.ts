import type { RequestHandler, Response } from "express";
import type { Logger } from "../core/logging.js";
import type { DirectorSpec, RuntimePreflightIssue, RuntimePreflightReport } from "../core/types.js";
import { getOrCreatePlayer, updateDirectorState } from "../state/game.js";
import { validateStateResponse } from "../rules/validator.js";
import type { RuntimePreflightService } from "./runtime-preflight.js";
import { normalizeDirectorState } from "./player-state.js";
import { createAuthoritativePlayerState, createStateResponsePayload } from "./http-contract.js";
import { readQueryValue } from "./request-utils.js";

interface StateRouteDependencies {
  runtimePreflight: RuntimePreflightService;
  ensureDatabaseReady: () => RuntimePreflightIssue | null;
  hasStorageBlocker: (preflight: RuntimePreflightReport) => boolean;
  buildRuntimeDebug: (preflight: RuntimePreflightReport) => unknown;
  buildSessionDebug: (player: ReturnType<typeof createAuthoritativePlayerState> | null) => unknown;
  getRequestLogger: (res: Response) => Logger;
  getDirectorSpec: () => DirectorSpec;
}

export function createStateHandler({
  runtimePreflight,
  ensureDatabaseReady,
  hasStorageBlocker,
  buildRuntimeDebug,
  buildSessionDebug,
  getRequestLogger,
  getDirectorSpec
}: StateRouteDependencies): RequestHandler {
  return async (req, res) => {
    let preflight = await runtimePreflight.ensureReport();
    if (!hasStorageBlocker(preflight)) {
      const dbIssue = ensureDatabaseReady();
      if (dbIssue) {
        preflight = await runtimePreflight.ensureReport({ force: true });
      }
    }

    if (hasStorageBlocker(preflight)) {
      return res.json({
        player: null,
        debug: {
          runtime: buildRuntimeDebug(preflight),
          session: null
        }
      });
    }

    const playerId = readQueryValue(req.query.playerId);
    const name = readQueryValue(req.query.name);
    const player = getOrCreatePlayer({ playerId, name });
    const normalized = normalizeDirectorState(player, getDirectorSpec());
    if (normalized.changed) {
      updateDirectorState(player.id, normalized.director);
      player.director_state = normalized.director;
    }

    const authoritativePlayer = createAuthoritativePlayerState(player);
    const stateResponse = createStateResponsePayload(authoritativePlayer);
    const stateResponseValidation = validateStateResponse(stateResponse);
    if (!stateResponseValidation.ok) {
      getRequestLogger(res).error("state request produced invalid response payload", {
        validationErrors: stateResponseValidation.errors
      });
      return res.status(500).json({
        error: "Invalid state response",
        detail: stateResponseValidation.errors,
        debug: {
          runtime: buildRuntimeDebug(preflight),
          session: null
        }
      });
    }

    return res.json({
      ...stateResponse,
      debug: {
        runtime: buildRuntimeDebug(preflight),
        session: buildSessionDebug(authoritativePlayer)
      }
    });
  };
}
