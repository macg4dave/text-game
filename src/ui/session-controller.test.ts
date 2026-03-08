import assert from "node:assert/strict";
import test from "node:test";
import { createInitialAppState } from "./app-state.js";
import type { HttpJsonResult } from "./http-client.js";
import { createSessionController } from "./session-controller.js";

function createSetupPayload(status: "ready" | "action-required" = "ready") {
  return {
    setup: {
      status,
      summary: status === "ready" ? "Ready." : "Setup required.",
      checked_at: "2026-03-08T00:00:00.000Z",
      can_retry: true,
      current_profile: {
        id: "local-gpu-small" as const,
        label: "Local GPU Small",
        provider: "litellm",
        chat_model: "game-chat",
        embedding_model: "game-embedding"
      },
      supported_path: {
        provider: "LiteLLM",
        title: "Supported MVP AI path",
        summary: "Use the launcher.",
        launcher: "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1",
        services: ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"]
      },
      preflight: {
        ok: status === "ready",
        status,
        summary: status === "ready" ? "Ready." : "Setup required.",
        issues: [],
        counts: {
          blocker: status === "ready" ? 0 : 1,
          warning: 0,
          info: 0
        },
        checked_at: "2026-03-08T00:00:00.000Z"
      }
    }
  };
}

function createStateResponse() {
  return {
    player: {
      id: "player-123",
      name: "Avery",
      location: "Rooftop Market",
      director_state: {
        current_beat_label: "Find the signal"
      }
    },
    debug: {
      runtime: {
        provider: "litellm"
      },
      session: {
        player_id: "player-123"
      }
    }
  };
}

function createJsonResult<T>(data: T): HttpJsonResult<T> {
  return {
    ok: true,
    status: 200,
    data,
    requestId: null
  };
}

test("session controller bootstrap loads setup and focuses the player name field", async () => {
  const state = createInitialAppState({
    playerId: "",
    playerName: "Avery",
    fatalError: null
  });
  const storage = new Map<string, string>();
  const statuses: string[] = [];
  const pending: boolean[] = [];
  let renderCount = 0;
  let focusedName = false;

  const controller = createSessionController({
    state,
    storage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
      removeItem(key) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      },
      key() {
        return null;
      },
      get length() {
        return storage.size;
      }
    },
    getActiveFatalUiError: () => null,
    getPlayerNameInput: () => "Avery",
    setPlayerNameInput() {},
    getTurnInput: () => "",
    setTurnInput() {},
    rememberPlayerName() {
      state.playerName = "Avery";
    },
    setStatus(text) {
      statuses.push(text);
    },
    setPending(value) {
      state.pending = value;
      pending.push(value);
    },
    addEntry() {},
    setAssist() {},
    setOptions() {},
    clearLog() {},
    render() {
      renderCount += 1;
    },
    focusInput() {},
    focusName() {
      focusedName = true;
    },
    getRuntimePreflight: () => state.setupStatus?.preflight || null,
    async fetchJson<T>(url: string, _options?: RequestInit): Promise<HttpJsonResult<T>> {
      assert.equal(url, "/api/setup/status");
      return createJsonResult<T>(createSetupPayload() as T);
    },
    formatErrorMessage(data, fallback) {
      if (Array.isArray(data?.detail)) {
        return data.detail.join(", ");
      }
      return data?.detail || data?.error || fallback;
    }
  });

  await controller.bootstrap();

  assert.equal(state.setupStatus?.status, "ready");
  assert.deepEqual(pending, [true, false]);
  assert.deepEqual(statuses, ["Checking supported setup", "Start a new game"]);
  assert.equal(renderCount, 1);
  assert.equal(focusedName, true);
});

test("session controller startGameFlow loads the player and adds the opening guide entry", async () => {
  const state = createInitialAppState({
    playerId: "player-old",
    playerName: "Avery",
    fatalError: null
  });
  state.setupStatus = createSetupPayload().setup;

  const storage = new Map<string, string>([["playerId", "player-old"]]);
  const entries: string[] = [];
  const pending: boolean[] = [];
  let focusedInput = false;

  const controller = createSessionController({
    state,
    storage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
      removeItem(key) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      },
      key() {
        return null;
      },
      get length() {
        return storage.size;
      }
    },
    getActiveFatalUiError: () => null,
    getPlayerNameInput: () => "Avery",
    setPlayerNameInput() {},
    getTurnInput: () => "",
    setTurnInput() {},
    rememberPlayerName() {
      state.playerName = "Avery";
    },
    setStatus() {},
    setPending(value) {
      state.pending = value;
      pending.push(value);
    },
    addEntry(_label, text) {
      entries.push(text);
    },
    setAssist() {},
    setOptions() {},
    clearLog() {},
    render() {},
    focusInput() {
      focusedInput = true;
    },
    focusName() {},
    getRuntimePreflight: () => state.setupStatus?.preflight || null,
    async fetchJson<T>(url: string, _options?: RequestInit): Promise<HttpJsonResult<T>> {
      assert.equal(url, "/api/state?name=Avery");
      return createJsonResult<T>(createStateResponse() as T);
    },
    formatErrorMessage(data, fallback) {
      if (Array.isArray(data?.detail)) {
        return data.detail.join(", ");
      }
      return data?.detail || data?.error || fallback;
    }
  });

  await controller.startGameFlow("new");

  assert.equal(state.hasEnteredFlow, true);
  assert.equal(state.player?.id, "player-123");
  assert.equal(storage.get("playerId"), "player-123");
  assert.deepEqual(entries, ["Avery arrives in Rooftop Market. Try \"look around\" or any short action to begin."]);
  assert.equal(focusedInput, true);
  assert.deepEqual(pending, [true, true, false]);
});
