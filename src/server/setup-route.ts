import type { RequestHandler, Response } from "express";
import type { Logger } from "../core/logging.js";
import type { AppConfig, RuntimePreflightIssue, RuntimePreflightReport } from "../core/types.js";
import { validateSetupStatusResponse } from "../rules/validator.js";
import type { RuntimePreflightService } from "./runtime-preflight.js";
import { createSetupStatusPayload } from "./setup-status.js";
import { matchesRefreshRequest, readQueryValue } from "./request-utils.js";

interface SetupRouteDependencies {
  config: AppConfig;
  runtimePreflight: RuntimePreflightService;
  ensureDatabaseReady: () => RuntimePreflightIssue | null;
  hasStorageBlocker: (preflight: RuntimePreflightReport) => boolean;
  getRequestLogger: (res: Response) => Logger;
}

export function createSetupStatusHandler({
  config,
  runtimePreflight,
  ensureDatabaseReady,
  hasStorageBlocker,
  getRequestLogger
}: SetupRouteDependencies): RequestHandler {
  return async (req, res) => {
    const refreshRequested = matchesRefreshRequest(readQueryValue(req.query.refresh));
    let preflight = await runtimePreflight.ensureReport({
      force: refreshRequested || !runtimePreflight.getCurrentReport().checked_at
    });

    if (!hasStorageBlocker(preflight)) {
      const dbIssue = ensureDatabaseReady();
      if (dbIssue) {
        preflight = await runtimePreflight.ensureReport({ force: true });
      }
    }

    const setupStatus = createSetupStatusPayload(config, preflight);
    const validation = validateSetupStatusResponse(setupStatus);
    if (!validation.ok) {
      getRequestLogger(res).error("setup status request produced invalid response payload", {
        validationErrors: validation.errors
      });
      return res.status(500).json({
        error: "Invalid setup status response",
        detail: validation.errors
      });
    }

    return res.json(setupStatus);
  };
}
