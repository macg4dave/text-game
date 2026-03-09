import type { RequestHandler, Response } from "express";
import type { Logger } from "../core/logging.js";
import type { RuntimePreflightIssue, RuntimePreflightReport } from "../core/types.js";
import { createAuthoritativePlayerState } from "./http-contract.js";
import type { RuntimePreflightService } from "./runtime-preflight.js";
import {
  validateSaveSlotActionResponse,
  validateSaveSlotLoadResponse,
  validateSaveSlotsResponse
} from "../rules/validator.js";
import { loadPlayerFromSaveSlot, listSaveSlots, SaveSlotError, savePlayerToSlot } from "../state/save-slots.js";

interface SaveSlotsRouteDependencies {
  runtimePreflight: RuntimePreflightService;
  ensureDatabaseReady: () => RuntimePreflightIssue | null;
  hasStorageBlocker: (preflight: RuntimePreflightReport) => boolean;
  getRequestLogger: (res: Response) => Logger;
}

export function createListSaveSlotsHandler({
  runtimePreflight,
  ensureDatabaseReady,
  hasStorageBlocker,
  getRequestLogger
}: SaveSlotsRouteDependencies): RequestHandler {
  return async (_req, res) => {
    const preflight = await ensureSlotsReady({ runtimePreflight, ensureDatabaseReady, hasStorageBlocker });
    if (preflight) {
      return res.status(503).json({
        error: "Setup required",
        detail: preflight.summary
      });
    }

    const payload = {
      slots: listSaveSlots()
    };
    const validation = validateSaveSlotsResponse(payload);
    if (!validation.ok) {
      getRequestLogger(res).error("save slots request produced invalid response payload", {
        validationErrors: validation.errors
      });
      return res.status(500).json({
        error: "Invalid save slots response",
        detail: validation.errors
      });
    }

    return res.json(payload);
  };
}

export function createSaveToSlotHandler({
  runtimePreflight,
  ensureDatabaseReady,
  hasStorageBlocker,
  getRequestLogger
}: SaveSlotsRouteDependencies): RequestHandler {
  return async (req, res) => {
    const preflight = await ensureSlotsReady({ runtimePreflight, ensureDatabaseReady, hasStorageBlocker });
    if (preflight) {
      return res.status(503).json({
        error: "Setup required",
        detail: preflight.summary
      });
    }

    const body = req.body as Partial<{ playerId: string; slotId: string; label: string }> | undefined;
    const playerId = readRequiredString(body?.playerId);
    if (!playerId) {
      return res.status(400).json({
        error: "Save failed",
        detail: "Pick or load a game before trying to save it into a slot."
      });
    }

    try {
      const slot = savePlayerToSlot({
        playerId,
        slotId: readOptionalString(body?.slotId),
        label: readOptionalString(body?.label)
      });
      const payload = {
        slot,
        slots: listSaveSlots()
      };
      const validation = validateSaveSlotActionResponse(payload);
      if (!validation.ok) {
        getRequestLogger(res).error("save slot request produced invalid response payload", {
          validationErrors: validation.errors
        });
        return res.status(500).json({
          error: "Invalid save slot response",
          detail: validation.errors
        });
      }

      return res.json(payload);
    } catch (error) {
      return handleSaveSlotError(error, res, getRequestLogger(res), "save slot request failed", "Save failed");
    }
  };
}

export function createLoadSaveSlotHandler({
  runtimePreflight,
  ensureDatabaseReady,
  hasStorageBlocker,
  getRequestLogger
}: SaveSlotsRouteDependencies): RequestHandler {
  return async (req, res) => {
    const preflight = await ensureSlotsReady({ runtimePreflight, ensureDatabaseReady, hasStorageBlocker });
    if (preflight) {
      return res.status(503).json({
        error: "Setup required",
        detail: preflight.summary
      });
    }

    const body = req.body as Partial<{ slotId: string }> | undefined;
    const slotId = readRequiredString(body?.slotId);
    if (!slotId) {
      return res.status(400).json({
        error: "Load failed",
        detail: "Choose a save slot before trying to load it."
      });
    }

    try {
      const loaded = loadPlayerFromSaveSlot(slotId);
      const payload = {
        slot: loaded.slot,
        slots: listSaveSlots(),
        player: createAuthoritativePlayerState(loaded.player)
      };
      const validation = validateSaveSlotLoadResponse(payload);
      if (!validation.ok) {
        getRequestLogger(res).error("load save slot request produced invalid response payload", {
          validationErrors: validation.errors
        });
        return res.status(500).json({
          error: "Invalid load response",
          detail: validation.errors
        });
      }

      return res.json(payload);
    } catch (error) {
      return handleSaveSlotError(error, res, getRequestLogger(res), "load save slot request failed", "Load failed");
    }
  };
}

async function ensureSlotsReady({
  runtimePreflight,
  ensureDatabaseReady,
  hasStorageBlocker
}: Pick<SaveSlotsRouteDependencies, "runtimePreflight" | "ensureDatabaseReady" | "hasStorageBlocker">): Promise<RuntimePreflightReport | null> {
  let preflight = await runtimePreflight.ensureReport();
  if (!hasStorageBlocker(preflight)) {
    const dbIssue = ensureDatabaseReady();
    if (dbIssue) {
      preflight = await runtimePreflight.ensureReport({ force: true });
    }
  }

  return hasStorageBlocker(preflight) ? preflight : null;
}

function handleSaveSlotError(
  error: unknown,
  res: Response,
  logger: Logger,
  message: string,
  title: string
): Response {
  if (error instanceof SaveSlotError) {
    logger.warn(message, {
      code: error.code,
      detail: error.message,
      statusCode: error.statusCode
    });
    return res.status(error.statusCode).json({
      error: title,
      detail: error.message
    });
  }

  logger.error(message, { error });
  return res.status(500).json({
    error: title,
    detail: error instanceof Error ? error.message : String(error)
  });
}

function readRequiredString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}
