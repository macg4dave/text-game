import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { Logger } from "../core/logging.js";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type DirectorSpec,
  type Player,
  type QuestSpec,
  type RuntimePreflightReport,
  type TurnOutputPayload
} from "../core/types.js";
import { createTurnExecutionTrace, type ExecuteTurnParams } from "../state/turn.js";
import { createTurnHandler } from "./turn-route.js";

function createPlayer(): Player {
  return {
    id: "player-123",
    name: "Avery",
    created_at: "2026-03-08T00:00:00.000Z",
    location: "Rooftop Market",
    summary: "You arrived at the market.",
    inventory: ["signal shard"],
    flags: ["market_seen"],
    quests: [
      {
        id: "intro-signal",
        status: "active",
        summary: "You noticed the first signal marker."
      }
    ],
    director_state: {
      end_goal: "Reach the tower",
      current_act_id: "act-1",
      current_act: "Arrival",
      current_beat_id: "beat-1",
      current_beat_label: "Find the signal",
      story_beats_remaining: 3,
      end_goal_progress: "You have started the search.",
      completed_beats: []
    }
  };
}

function createDirectorSpec(): DirectorSpec {
  return {
    end_goal: "Reach the tower",
    acts: [
      {
        id: "act-1",
        name: "Arrival",
        beats: [
          {
            id: "beat-1",
            label: "Find the signal",
            unlock_flags: ["signal_seen"]
          }
        ]
      }
    ]
  };
}

function createQuestSpec(): QuestSpec {
  return {
    quests: [
      {
        id: "intro-signal",
        title: "Follow the signal",
        stages: [
          {
            id: "stage-1",
            label: "Notice the marker"
          }
        ]
      }
    ]
  };
}

function createTurnOutput(): TurnOutputPayload {
  return {
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "The signal lantern hums softly.",
    player_options: ["Inspect the lantern"],
    state_updates: {
      location: "Rooftop Market",
      inventory_add: [],
      inventory_remove: [],
      flags_add: ["signal_seen"],
      flags_remove: [],
      quests: []
    },
    director_updates: {
      end_goal_progress: "The signal now points toward the tower."
    },
    memory_updates: ["The signal lantern hummed when touched."]
  };
}

function createPreflightReport(): RuntimePreflightReport {
  return {
    ok: true,
    status: "ready",
    summary: "Ready.",
    issues: [],
    counts: {
      blocker: 0,
      warning: 0,
      info: 0
    },
    checked_at: "2026-03-08T00:00:00.000Z"
  };
}

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

function createMockResponse() {
  const headers = new Map<string, string>();
  const response = {
    locals: {},
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };

  return {
    response: response as unknown as Response & { body: unknown; statusCode: number },
    headers
  };
}

test("createTurnHandler keeps the route thin by delegating execution to injected turn service dependencies", async () => {
  const player = createPlayer();
  const refreshedPlayer: Player = {
    ...player,
    flags: ["market_seen", "signal_seen"]
  };
  const turnOutput = createTurnOutput();
  let capturedExecuteParams: ExecuteTurnParams | null = null;

  const handler = createTurnHandler({
    runtimePreflight: {
      ensureReport: async () => createPreflightReport(),
      getCurrentReport: () => createPreflightReport()
    },
    ensureDatabaseReady: () => null,
    getRequestLogger: () => createLogger(),
    buildTurnDebugPayload: ({ requestId }) => ({ requestId, source: "turn-route-test" }),
    model: "game-chat",
    embeddingModel: "game-embedding",
    getDirectorSpec: () => createDirectorSpec(),
    getQuestSpec: () => createQuestSpec(),
    getOrCreatePlayer: () => player,
    updateDirectorState() {
      return null;
    },
    turnExecutionService: {
      async executeTurn(params) {
        capturedExecuteParams = params;
        const trace = createTurnExecutionTrace(params.input);
        trace.player = player;
        trace.refreshedPlayer = refreshedPlayer;
        trace.result = turnOutput;
        return {
          ok: true,
          refreshedPlayer,
          turnOutput,
          trace
        };
      }
    }
  });

  const req = {
    body: {
      input: "inspect the lantern"
    },
    headers: {},
    path: "/api/turn",
    method: "POST"
  } as Request;
  const { response, headers } = createMockResponse();

  await handler(req, response, (() => undefined) as never);

  if (!capturedExecuteParams) {
    throw new Error("Expected injected turnExecutionService to receive executeTurn params.");
  }

  const executedParams: ExecuteTurnParams = capturedExecuteParams;
  assert.equal(executedParams.input, "inspect the lantern");
  assert.equal(executedParams.model, "game-chat");
  assert.equal(executedParams.embeddingModel, "game-embedding");
  assert.equal((response.body as { narrative?: string }).narrative, turnOutput.narrative);
  assert.equal((response.body as { player?: { schema_version?: string } }).player?.schema_version, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.equal(headers.get("x-request-id") !== undefined, true);
});

test("createTurnHandler returns the injected turn-service failure payload for malformed or failed model execution", async () => {
  const player = createPlayer();

  const handler = createTurnHandler({
    runtimePreflight: {
      ensureReport: async () => createPreflightReport(),
      getCurrentReport: () => createPreflightReport()
    },
    ensureDatabaseReady: () => null,
    getRequestLogger: () => createLogger(),
    buildTurnDebugPayload: ({ error }) => ({ error, source: "turn-route-test" }),
    model: "game-chat",
    embeddingModel: "game-embedding",
    getDirectorSpec: () => createDirectorSpec(),
    getQuestSpec: () => createQuestSpec(),
    getOrCreatePlayer: () => player,
    updateDirectorState() {
      return null;
    },
    turnExecutionService: {
      async executeTurn(params) {
        const trace = createTurnExecutionTrace(params.input);
        trace.player = player;
        return {
          ok: false,
          statusCode: 400,
          error: "Invalid turn output",
          detail: ["narrative must be a string."],
          reason: "turn_output_validation",
          trace
        };
      }
    }
  });

  const req = {
    body: {
      input: "inspect the lantern"
    },
    headers: {},
    path: "/api/turn",
    method: "POST"
  } as Request;
  const { response } = createMockResponse();

  await handler(req, response, (() => undefined) as never);

  assert.equal(response.statusCode, 400);
  assert.equal((response.body as { error?: string }).error, "Invalid turn output");
  assert.deepEqual((response.body as { detail?: string[] }).detail, ["narrative must be a string."]);
});