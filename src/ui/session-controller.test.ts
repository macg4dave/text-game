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
        launcher: "cargo run --manifest-path launcher/Cargo.toml -- start-dev",
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
  let saveSlotLabel = "";

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
    getSaveSlotLabelInput: () => saveSlotLabel,
    setSaveSlotLabelInput(value) {
      saveSlotLabel = value;
    },
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
      if (url === "/api/setup/status") {
        return createJsonResult<T>(createSetupPayload() as T);
      }

      assert.equal(url, "/api/save-slots");
      return createJsonResult<T>(({ slots: [] } as unknown) as T);
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
  assert.equal(renderCount, 2);
  assert.equal(focusedName, true);
});

test("session controller bootstrap invites resume when a browser session is already saved", async () => {
  const state = createInitialAppState({
    playerId: "player-saved",
    playerName: "Avery",
    fatalError: null
  });
  const statuses: string[] = [];

  const controller = createSessionController({
    state,
    storage: windowlessStorage([["playerId", "player-saved"]]),
    getActiveFatalUiError: () => null,
    getPlayerNameInput: () => "Avery",
    setPlayerNameInput() {},
    getSaveSlotLabelInput: () => "",
    setSaveSlotLabelInput() {},
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
    },
    addEntry() {},
    setAssist() {},
    setOptions() {},
    clearLog() {},
    render() {},
    focusInput() {},
    focusName() {},
    getRuntimePreflight: () => state.setupStatus?.preflight || null,
    async fetchJson<T>(url: string, _options?: RequestInit): Promise<HttpJsonResult<T>> {
      if (url === "/api/setup/status") {
        return createJsonResult<T>(createSetupPayload() as T);
      }

      assert.equal(url, "/api/save-slots");
      return createJsonResult<T>(({ slots: [] } as unknown) as T);
    },
    formatErrorMessage(data, fallback) {
      if (Array.isArray(data?.detail)) {
        return data.detail.join(", ");
      }
      return data?.detail || data?.error || fallback;
    }
  });

  await controller.bootstrap();

  assert.deepEqual(statuses, ["Checking supported setup", "Resume or start new"]);
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
  let saveSlotLabel = "";

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
    getSaveSlotLabelInput: () => saveSlotLabel,
    setSaveSlotLabelInput(value) {
      saveSlotLabel = value;
    },
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
  assert.deepEqual(entries, ["Avery arrives in Rooftop Market. Try \"find the signal\" or another short action to begin."]);
  assert.equal(focusedInput, true);
  assert.deepEqual(pending, [true, true, false]);
});

test("session controller startGameFlow resumes the saved browser session with resume guidance", async () => {
  const state = createInitialAppState({
    playerId: "player-saved",
    playerName: "Avery",
    fatalError: null
  });
  state.setupStatus = createSetupPayload().setup;

  const entries: string[] = [];
  const requestedUrls: string[] = [];

  const controller = createSessionController({
    state,
    storage: windowlessStorage([["playerId", "player-saved"]]),
    getActiveFatalUiError: () => null,
    getPlayerNameInput: () => "Avery",
    setPlayerNameInput() {},
    getSaveSlotLabelInput: () => "",
    setSaveSlotLabelInput() {},
    getTurnInput: () => "",
    setTurnInput() {},
    rememberPlayerName() {
      state.playerName = "Avery";
    },
    setStatus() {},
    setPending(value) {
      state.pending = value;
    },
    addEntry(_label, text) {
      entries.push(text);
    },
    setAssist() {},
    setOptions() {},
    clearLog() {},
    render() {},
    focusInput() {},
    focusName() {},
    getRuntimePreflight: () => state.setupStatus?.preflight || null,
    async fetchJson<T>(url: string, _options?: RequestInit): Promise<HttpJsonResult<T>> {
      requestedUrls.push(url);
      assert.equal(url, "/api/state?playerId=player-saved&name=Avery");
      return createJsonResult<T>(createStateResponse() as T);
    },
    formatErrorMessage(data, fallback) {
      if (Array.isArray(data?.detail)) {
        return data.detail.join(", ");
      }
      return data?.detail || data?.error || fallback;
    }
  });

  await controller.startGameFlow("resume");

  assert.equal(state.hasEnteredFlow, true);
  assert.equal(state.playerId, "player-123");
  assert.deepEqual(requestedUrls, ["/api/state?playerId=player-saved&name=Avery"]);
  assert.deepEqual(entries, [
    'Back in Rooftop Market. Continue where you left off or pick up the current lead: "find the signal."'
  ]);
});

test("session controller startGameFlow keeps onboarding on the launch screen when setup is still blocked", async () => {
  const state = createInitialAppState({
    playerId: "player-saved",
    playerName: "Avery",
    fatalError: null
  });
  state.setupStatus = createSetupPayload("action-required").setup;

  const entries: string[] = [];
  const statuses: string[] = [];
  const requestedUrls: string[] = [];

  const controller = createSessionController({
    state,
    storage: windowlessStorage([["playerId", "player-saved"]]),
    getActiveFatalUiError: () => null,
    getPlayerNameInput: () => "Avery",
    setPlayerNameInput() {},
    getSaveSlotLabelInput: () => "",
    setSaveSlotLabelInput() {},
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
    },
    addEntry(_label, text) {
      entries.push(text);
    },
    setAssist() {},
    setOptions() {},
    clearLog() {},
    render() {},
    focusInput() {},
    focusName() {},
    getRuntimePreflight: () => state.setupStatus?.preflight || null,
    async fetchJson<T>(url: string, _options?: RequestInit): Promise<HttpJsonResult<T>> {
      requestedUrls.push(url);
      assert.equal(url, "/api/setup/status?refresh=1");
      return createJsonResult<T>(createSetupPayload("action-required") as T);
    },
    formatErrorMessage(data, fallback) {
      if (Array.isArray(data?.detail)) {
        return data.detail.join(", ");
      }
      return data?.detail || data?.error || fallback;
    }
  });

  await controller.startGameFlow("new");

  assert.equal(state.hasEnteredFlow, false);
  assert.equal(state.player, null);
  assert.deepEqual(entries, []);
  assert.deepEqual(requestedUrls, ["/api/setup/status?refresh=1"]);
  assert.deepEqual(statuses, ["Starting new game", "Setup required"]);
});

test("session controller loadSaveSlot loads a named save and refreshes the live session", async () => {
  const state = createInitialAppState({
    playerId: "",
    playerName: "Avery",
    fatalError: null
  });
  state.setupStatus = createSetupPayload().setup;

  const storage = new Map<string, string>();
  const entries: string[] = [];
  const fetchUrls: string[] = [];
  let saveSlotLabel = "";

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
    getSaveSlotLabelInput: () => saveSlotLabel,
    setSaveSlotLabelInput(value) {
      saveSlotLabel = value;
    },
    getTurnInput: () => "",
    setTurnInput() {},
    rememberPlayerName() {
      state.playerName = "Avery";
    },
    setStatus() {},
    setPending(value) {
      state.pending = value;
    },
    addEntry(_label, text) {
      entries.push(text);
    },
    setAssist() {},
    setOptions() {},
    clearLog() {},
    render() {},
    focusInput() {},
    focusName() {},
    getRuntimePreflight: () => state.setupStatus?.preflight || null,
    async fetchJson<T>(url: string, _options?: RequestInit): Promise<HttpJsonResult<T>> {
      fetchUrls.push(url);
      if (url === "/api/save-slots/load") {
        return createJsonResult<T>(
          ({
            slot: {
              schema_version: "save-slot/v1",
              id: "slot-1",
              label: "Bridge Checkpoint",
              player_id: "snapshot-1",
              player_name: "Avery",
              location: "Rooftop Market",
              source_schema_version: "authoritative-state/v1",
              saved_at: "2026-03-09T00:00:00.000Z",
              updated_at: "2026-03-09T00:00:00.000Z",
              status: "ready",
              detail: null
            },
            slots: [
              {
                schema_version: "save-slot/v1",
                id: "slot-1",
                label: "Bridge Checkpoint",
                player_id: "snapshot-1",
                player_name: "Avery",
                location: "Rooftop Market",
                source_schema_version: "authoritative-state/v1",
                saved_at: "2026-03-09T00:00:00.000Z",
                updated_at: "2026-03-09T00:00:00.000Z",
                status: "ready",
                detail: null
              }
            ],
            player: {
              id: "player-loaded",
              name: "Avery",
              location: "Rooftop Market",
              director_state: {
                current_beat_label: "Find the signal"
              }
            }
          } as unknown) as T
        );
      }

      assert.equal(url, "/api/state?playerId=player-loaded&name=Avery");
      return createJsonResult<T>(createStateResponse() as T);
    },
    formatErrorMessage(data, fallback) {
      if (Array.isArray(data?.detail)) {
        return data.detail.join(", ");
      }
      return data?.detail || data?.error || fallback;
    }
  });

  await controller.loadSaveSlot("slot-1");

  assert.equal(state.hasEnteredFlow, true);
  assert.equal(state.currentSaveSlotId, "slot-1");
  assert.equal(storage.get("playerId"), "player-123");
  assert.deepEqual(fetchUrls, ["/api/save-slots/load", "/api/state?playerId=player-loaded&name=Avery"]);
  assert.match(entries[0] || "", /Loaded \"Bridge Checkpoint\"/i);
});

function windowlessStorage(entries: Iterable<[string, string]> = []): Storage {
  const storage = new Map<string, string>(entries);

  return {
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
  };
}
