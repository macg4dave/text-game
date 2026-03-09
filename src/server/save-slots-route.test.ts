import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import test from "node:test";
import type { Request, Response } from "express";
import type { Logger } from "../core/logging.js";

const tempDirectory = mkdtempSync(`${os.tmpdir().replace(/[\\/]?$/, `${pathSeparator()}`)}text-game-save-slots-route-test-`);
process.env.GAME_DB_PATH = `${tempDirectory}${pathSeparator()}game.db`;

const dbModule = await import("../core/db.js");
const gameModule = await import("../state/game.js");
const routeModule = await import("./save-slots-route.js");

function createLogger(): Logger {
  const logger = {
    child() {
      return logger;
    },
    debug() {},
    info() {},
    warn() {},
    error() {}
  };

  return logger as Logger;
}

function createPreflightReport() {
  return {
    ok: true,
    status: "ready" as const,
    summary: "Ready.",
    issues: [],
    counts: {
      blocker: 0,
      warning: 0,
      info: 0
    },
    checked_at: "2026-03-09T00:00:00.000Z"
  };
}

function createMockResponse() {
  const response = {
    locals: {},
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };

  return response as unknown as Response & { body: unknown; statusCode: number };
}

test("save slot route lists, saves, and loads slots through the thin HTTP boundary", async () => {
  dbModule.resetDb();
  const player = gameModule.getOrCreatePlayer({ playerId: "player-route", name: "Avery" });

  const listHandler = routeModule.createListSaveSlotsHandler({
    runtimePreflight: {
      ensureReport: async () => createPreflightReport(),
      getCurrentReport: () => createPreflightReport()
    },
    ensureDatabaseReady: () => null,
    hasStorageBlocker: () => false,
    getRequestLogger: () => createLogger()
  });
  const saveHandler = routeModule.createSaveToSlotHandler({
    runtimePreflight: {
      ensureReport: async () => createPreflightReport(),
      getCurrentReport: () => createPreflightReport()
    },
    ensureDatabaseReady: () => null,
    hasStorageBlocker: () => false,
    getRequestLogger: () => createLogger()
  });
  const loadHandler = routeModule.createLoadSaveSlotHandler({
    runtimePreflight: {
      ensureReport: async () => createPreflightReport(),
      getCurrentReport: () => createPreflightReport()
    },
    ensureDatabaseReady: () => null,
    hasStorageBlocker: () => false,
    getRequestLogger: () => createLogger()
  });

  const initialListResponse = createMockResponse();
  await listHandler({} as Request, initialListResponse, (() => undefined) as never);
  assert.deepEqual(initialListResponse.body, { slots: [] });

  const saveResponse = createMockResponse();
  await saveHandler(
    {
      body: {
        playerId: player.id,
        label: "Bridge Checkpoint"
      }
    } as Request,
    saveResponse,
    (() => undefined) as never
  );

  assert.equal(saveResponse.statusCode, 200);
  const savedBody = saveResponse.body as {
    slot: { id: string; label: string };
    slots: Array<{ id: string; label: string }>;
  };
  assert.equal(savedBody.slot.label, "Bridge Checkpoint");
  assert.equal(savedBody.slots.length, 1);

  const loadResponse = createMockResponse();
  await loadHandler(
    {
      body: {
        slotId: savedBody.slot.id
      }
    } as Request,
    loadResponse,
    (() => undefined) as never
  );

  assert.equal(loadResponse.statusCode, 200);
  const loadedBody = loadResponse.body as {
    slot: { id: string };
    player: { id: string; name: string };
  };
  assert.equal(loadedBody.slot.id, savedBody.slot.id);
  assert.equal(loadedBody.player.name, "Avery");
  assert.notEqual(loadedBody.player.id, player.id);
});

test("load save slot route returns a plain-language error when the slot does not exist", async () => {
  dbModule.resetDb();

  const loadHandler = routeModule.createLoadSaveSlotHandler({
    runtimePreflight: {
      ensureReport: async () => createPreflightReport(),
      getCurrentReport: () => createPreflightReport()
    },
    ensureDatabaseReady: () => null,
    hasStorageBlocker: () => false,
    getRequestLogger: () => createLogger()
  });

  const response = createMockResponse();
  await loadHandler(
    {
      body: {
        slotId: "missing-slot"
      }
    } as Request,
    response,
    (() => undefined) as never
  );

  assert.equal(response.statusCode, 404);
  assert.equal((response.body as { error?: string }).error, "Load failed");
  assert.match(String((response.body as { detail?: string }).detail), /could not be found/i);
});

test.after(() => {
  dbModule.closeDb();
  rmSync(tempDirectory, { recursive: true, force: true });
});

function pathSeparator(): string {
  return os.tmpdir().includes("\\") ? "\\" : "/";
}
