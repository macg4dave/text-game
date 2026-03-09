import type {
  AssistApiResponse,
  PlayerState,
  RuntimePreflightPayload,
  SaveSlotActionApiResponse,
  SaveSlotLoadApiResponse,
  SaveSlotsApiResponse,
  SaveSlotSummary,
  SetupStatusPayload,
  StateApiResponse,
  TurnApiResponse
} from "./contracts.js";
import type { AppState } from "./app-state.js";
import { hasSavedSession, isSetupReady } from "./app-state.js";
import type { FatalUiErrorState } from "./global-error.js";
import type { HttpJsonResult } from "./http-client.js";

type StatusTone = "idle" | "working" | "error" | "ok";

export interface SessionControllerContext {
  state: AppState;
  storage: Storage;
  getActiveFatalUiError: () => FatalUiErrorState | null;
  getPlayerNameInput: () => string;
  setPlayerNameInput: (value: string) => void;
  getSaveSlotLabelInput: () => string;
  setSaveSlotLabelInput: (value: string) => void;
  getTurnInput: () => string;
  setTurnInput: (value: string) => void;
  rememberPlayerName: () => void;
  setStatus: (text: string, tone?: StatusTone) => void;
  setPending: (pending: boolean) => void;
  addEntry: (label: string, text: string, tone?: string) => void;
  setAssist: (
    corrections?: Array<{ token: string; suggestions: string[] }>,
    completions?: string[]
  ) => void;
  setOptions: (options?: string[]) => void;
  clearLog: () => void;
  render: () => void;
  focusInput: () => void;
  focusName: () => void;
  getRuntimePreflight: () => RuntimePreflightPayload | null;
  fetchJson: <T>(url: string, options?: RequestInit) => Promise<HttpJsonResult<T>>;
  formatErrorMessage: (data: { detail?: string | string[]; error?: string } | undefined, fallback: string) => string;
}

export function createSessionController(context: SessionControllerContext) {
  return {
    loadSetupStatus,
    loadSaveSlots,
    ensurePlayer,
    startGameFlow,
    saveCurrentToSlot,
    loadSaveSlot,
    requestAssist,
    submitTurn,
    refreshSession,
    bootstrap,
    runSetupCheck,
    handleFatalError,
    clearSessionView
  };

  function hasFatalBlocker(): boolean {
    return Boolean(context.state.fatalError || context.getActiveFatalUiError());
  }

  function updateSessionData(data: StateApiResponse): void {
    context.state.sessionDebug = data.debug || context.state.sessionDebug;

    if (!data.player) {
      context.state.player = null;
      context.render();
      return;
    }

    context.state.player = data.player;
    context.state.playerId = data.player.id;
    context.storage.setItem("playerId", context.state.playerId);
    if (!context.getPlayerNameInput().trim()) {
      context.setPlayerNameInput(data.player.name);
    }
    context.rememberPlayerName();
    context.render();
  }

  function updateSaveSlotData(data: { slots?: SaveSlotSummary[] } | undefined): void {
    context.state.saveSlots = Array.isArray(data?.slots) ? data.slots : [];
    context.state.saveSlotsError = null;
    context.render();
  }

  async function loadSetupStatus({ force = false } = {}): Promise<void> {
    const suffix = force ? "?refresh=1" : "";
    const result = await context.fetchJson<SetupStatusPayload>(`/api/setup/status${suffix}`);
    if (!result.ok || !result.data?.setup) {
      throw new Error(context.formatErrorMessage(result.data, `Setup request failed (${result.status})`));
    }

    context.state.setupStatus = result.data.setup;
    context.state.setupError = null;
    context.render();
  }

  async function loadSaveSlots(): Promise<void> {
    const result = await context.fetchJson<SaveSlotsApiResponse>("/api/save-slots");
    if (!result.ok || !Array.isArray(result.data?.slots)) {
      throw new Error(context.formatErrorMessage(result.data, `Save slots request failed (${result.status})`));
    }

    updateSaveSlotData(result.data);
  }

  async function ensurePlayer({ force = false, showStatus = false } = {}): Promise<PlayerState | null> {
    if (hasFatalBlocker()) {
      return null;
    }

    if (!force && context.state.playerId && context.state.player) {
      context.rememberPlayerName();
      return context.state.player;
    }

    if (showStatus) {
      context.setStatus("Loading session", "working");
    }

    context.rememberPlayerName();
    const params = new URLSearchParams();
    if (context.state.playerId) {
      params.set("playerId", context.state.playerId);
    }
    if (context.getPlayerNameInput().trim()) {
      params.set("name", context.getPlayerNameInput().trim());
    }

    const result = await context.fetchJson<StateApiResponse>(`/api/state?${params.toString()}`);
    if (!result.ok) {
      const message = context.formatErrorMessage(result.data, `State request failed (${result.status})`);
      throw new Error(message);
    }

    updateSessionData(result.data);

    const preflight = context.getRuntimePreflight();
    if (!context.state.player) {
      if (preflight?.status === "action-required") {
        if (showStatus) {
          context.setStatus("Setup required", "error");
        }
        return null;
      }

      throw new Error("Player initialization failed.");
    }

    if (showStatus) {
      if (preflight?.status === "action-required") {
        context.setStatus("Setup required", "error");
      } else if (preflight?.status === "checking") {
        context.setStatus("Checking AI setup", "working");
      } else {
        context.setStatus("Session ready", "ok");
      }
    }

    return context.state.player;
  }

  function clearSessionView({ clearSavedPlayerId }: { clearSavedPlayerId: boolean }): void {
    if (clearSavedPlayerId) {
      context.storage.removeItem("playerId");
      context.state.playerId = "";
      context.state.currentSaveSlotId = null;
    }

    context.state.player = null;
    context.state.sessionDebug = null;
    context.state.lastTurnDebug = null;
    context.clearLog();
    context.setOptions([]);
    context.setAssist([], []);
    context.render();
  }

  async function startGameFlow(mode: "new" | "resume"): Promise<void> {
    if (context.state.pending || hasFatalBlocker()) {
      return;
    }

    if (mode === "resume" && !hasSavedSession(context.state)) {
      context.setStatus("No saved game to resume", "error");
      return;
    }

    context.setPending(true);
    context.setStatus(mode === "resume" ? "Resuming game" : "Starting new game", "working");

    try {
      if (!isSetupReady(context.state)) {
        await loadSetupStatus({ force: true });
      }

      if (!isSetupReady(context.state)) {
        context.setStatus("Setup required", "error");
        return;
      }

      context.state.hasEnteredFlow = true;
      clearSessionView({ clearSavedPlayerId: mode === "new" });
      context.setPending(true);

      const player = await ensurePlayer({ force: true });
      if (!player) {
        context.setStatus("Setup required", "error");
        return;
      }

      const guideMessage =
        mode === "resume"
          ? `Back in ${player.location}. Continue where you left off or try "look around" to get your bearings.`
          : `${player.name} arrives in ${player.location}. Try "look around" or any short action to begin.`;
      context.addEntry("Guide", guideMessage, "system");
      context.setStatus(mode === "resume" ? "Game resumed" : "New game ready", "ok");
    } catch (error) {
      context.addEntry("System", error instanceof Error ? error.message : "Session start failed.", "system");
      context.setStatus(mode === "resume" ? "Resume failed" : "Start failed", "error");
    } finally {
      context.setPending(false);
      if (context.state.player && !hasFatalBlocker()) {
        context.focusInput();
      }
    }
  }

  async function saveCurrentToSlot(slotId?: string): Promise<void> {
    if (context.state.pending || hasFatalBlocker() || !context.state.hasEnteredFlow) {
      return;
    }

    try {
      context.setPending(true);
      context.setStatus(slotId ? "Updating save slot" : "Saving game", "working");
      const player = await ensurePlayer();
      if (!player) {
        context.setStatus("Setup required", "error");
        return;
      }

      const result = await context.fetchJson<SaveSlotActionApiResponse>("/api/save-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: context.state.playerId,
          slotId,
          label: context.getSaveSlotLabelInput().trim()
        })
      });

      if (!result.ok || !result.data?.slot || !Array.isArray(result.data?.slots)) {
        throw new Error(context.formatErrorMessage(result.data, `Save request failed (${result.status})`));
      }

      updateSaveSlotData(result.data);
      context.state.currentSaveSlotId = result.data.slot.id;
      if (!slotId) {
        context.setSaveSlotLabelInput("");
      }
      context.addEntry("System", `Saved to \"${result.data.slot.label}\".`, "system");
      context.setStatus("Game saved", "ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      context.state.saveSlotsError = message;
      context.render();
      context.addEntry("System", message, "system");
      context.setStatus("Save failed", "error");
    } finally {
      context.setPending(false);
    }
  }

  async function loadSaveSlot(slotId: string): Promise<void> {
    if (context.state.pending || hasFatalBlocker()) {
      return;
    }

    context.setPending(true);
    context.setStatus("Loading save", "working");

    try {
      if (!isSetupReady(context.state)) {
        await loadSetupStatus({ force: true });
      }

      if (!isSetupReady(context.state)) {
        context.setStatus("Setup required", "error");
        return;
      }

      const result = await context.fetchJson<SaveSlotLoadApiResponse>("/api/save-slots/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId })
      });

      if (!result.ok || !result.data?.slot || !result.data?.player || !Array.isArray(result.data?.slots)) {
        throw new Error(context.formatErrorMessage(result.data, `Load request failed (${result.status})`));
      }

      context.state.hasEnteredFlow = true;
      clearSessionView({ clearSavedPlayerId: true });
      updateSaveSlotData(result.data);
      context.state.currentSaveSlotId = result.data.slot.id;
      context.state.playerId = result.data.player.id;
      context.state.player = result.data.player;
      context.storage.setItem("playerId", result.data.player.id);
      if (!context.getPlayerNameInput().trim()) {
        context.setPlayerNameInput(result.data.player.name);
      }
      context.rememberPlayerName();
      await ensurePlayer({ force: true });
      context.addEntry(
        "Guide",
        `Loaded \"${result.data.slot.label}\". ${result.data.player.name} is back in ${result.data.player.location}.`,
        "system"
      );
      context.setStatus("Save loaded", "ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed.";
      context.state.saveSlotsError = message;
      context.render();
      context.addEntry("System", message, "system");
      context.setStatus("Load failed", "error");
    } finally {
      context.setPending(false);
      if (context.state.player && !hasFatalBlocker()) {
        context.focusInput();
      }
    }
  }

  async function requestAssist(): Promise<void> {
    if (context.state.pending || hasFatalBlocker() || !context.state.hasEnteredFlow || !context.state.player) {
      return;
    }

    const input = context.getTurnInput().trim();
    if (!input) {
      context.setAssist([], []);
      return;
    }

    try {
      const player = await ensurePlayer();
      if (!player) {
        return;
      }

      const result = await context.fetchJson<AssistApiResponse>("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: context.state.playerId,
          name: context.getPlayerNameInput().trim(),
          input
        })
      });

      if (!result.ok) {
        return;
      }

      context.setAssist(result.data.corrections || [], result.data.completions || []);
    } catch {
      context.setAssist([], []);
    }
  }

  async function submitTurn(): Promise<void> {
    if (context.state.pending || hasFatalBlocker() || !context.state.hasEnteredFlow) {
      return;
    }

    const input = context.getTurnInput().trim();
    if (!input) {
      return;
    }

    context.setPending(true);
    context.setStatus("Sending turn", "working");

    try {
      const player = await ensurePlayer();
      if (!player) {
        context.setStatus("Setup required", "error");
        return;
      }

      context.addEntry("You", input, "player");
      context.setTurnInput("");
      context.setAssist([], []);

      const result = await context.fetchJson<TurnApiResponse>("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: context.state.playerId,
          name: context.getPlayerNameInput().trim(),
          input
        })
      });

      if (result.data?.debug) {
        context.state.lastTurnDebug = result.data.debug;
        context.state.sessionDebug = {
          runtime: result.data.debug.runtime,
          session: result.data.debug.session
        };
      }
      if (result.data?.player) {
        context.state.player = result.data.player;
      }
      context.render();

      if (!result.ok) {
        const message = context.formatErrorMessage(result.data, `Turn request failed (${result.status})`);
        context.addEntry("System", message, "system");
        context.setStatus("Turn failed", "error");
        return;
      }

      context.addEntry("Narrator", result.data.narrative || "No narrative returned.", "narrator");
      context.setOptions(result.data.player_options || []);
      const latency =
        typeof result.data.debug?.turn?.latency_ms === "number" ? result.data.debug.turn.latency_ms : undefined;
      context.setStatus(typeof latency === "number" ? `Turn complete in ${latency} ms` : "Turn complete", "ok");
    } catch (error) {
      context.addEntry("System", error instanceof Error ? error.message : "Request failed.", "system");
      context.setStatus("Request failed", "error");
    } finally {
      context.setPending(false);
      if (context.state.player && !hasFatalBlocker()) {
        context.focusInput();
      }
    }
  }

  async function refreshSession(): Promise<void> {
    if (hasFatalBlocker() || !context.state.hasEnteredFlow) {
      return;
    }

    try {
      context.setPending(true);
      context.setStatus("Refreshing game", "working");
      const player = await ensurePlayer({ force: true });
      if (player) {
        context.addEntry("System", "Game state refreshed.", "system");
      }

      const preflight = context.getRuntimePreflight();
      if (preflight?.status === "action-required") {
        context.setStatus("Setup required", "error");
      } else if (preflight?.status === "checking") {
        context.setStatus("Checking AI setup", "working");
      } else {
        context.setStatus("Session ready", "ok");
      }
    } catch (error) {
      context.addEntry("System", error instanceof Error ? error.message : "Refresh failed.", "system");
      context.setStatus("Refresh failed", "error");
    } finally {
      context.setPending(false);
    }
  }

  async function bootstrap(): Promise<void> {
    context.setPending(true);
    context.setStatus("Checking supported setup", "working");
    try {
      await loadSetupStatus();
      try {
        await loadSaveSlots();
      } catch (error) {
        context.state.saveSlotsError = error instanceof Error ? error.message : "Save slots unavailable.";
        context.render();
      }
      if (isSetupReady(context.state)) {
        context.setStatus(hasSavedSession(context.state) ? "Resume or start new" : "Start a new game", "idle");
      } else {
        context.setStatus("Setup required", "error");
      }
    } catch (error) {
      context.state.setupError = error instanceof Error ? error.message : "Setup check failed.";
      context.render();
      context.setStatus("Setup check failed", "error");
    } finally {
      context.setPending(false);
    }
    context.focusName();
  }

  async function runSetupCheck(): Promise<void> {
    if (hasFatalBlocker()) {
      return;
    }

    try {
      context.setPending(true);
      context.setStatus("Checking AI setup", "working");
      await loadSetupStatus({ force: true });
      if (isSetupReady(context.state)) {
        context.setStatus("Setup ready", "ok");
      } else {
        context.setStatus("Setup required", "error");
      }
    } catch (error) {
      context.state.setupError = error instanceof Error ? error.message : "Setup check failed.";
      context.render();
      context.setStatus("Setup check failed", "error");
    } finally {
      context.setPending(false);
    }
  }

  function handleFatalError(stateUpdate: FatalUiErrorState, renderFatalError: (state: FatalUiErrorState) => void): void {
    context.state.fatalError = stateUpdate;
    renderFatalError(stateUpdate);
    context.render();
    context.setPending(false);
  }
}
