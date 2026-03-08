import { createFatalUiErrorState, registerGlobalErrorHandlers, type FatalUiErrorState } from "./global-error.js";
import {
  type AssistApiResponse,
  type PlayerState,
  type RuntimeConfigDiagnostics,
  type RuntimeConfigProfile,
  type RuntimeLocalGpuSelection,
  type RuntimePreflightPayload,
  type SessionDebugPayload,
  type SetupStatus,
  type SetupStatusPayload,
  type StateApiResponse,
  type TurnApiResponse,
  type TurnDebugPayload
} from "./contracts.js";
import { getElement } from "./dom.js";
import { renderDebugPanels as renderDebugView } from "./debug-view.js";
import { fetchJson, formatErrorMessage } from "./http-client.js";
import { renderLaunchPanel as renderLaunchView } from "./launch-view.js";
import { getStoredPlayerName, rememberPlayerName as persistPlayerName } from "./player-name.js";
import {
  getRuntimeConfigDiagnostics as selectRuntimeConfigDiagnostics,
  getRuntimeLocalGpuSelection as selectRuntimeLocalGpuSelection,
  getRuntimePreflight as selectRuntimePreflight,
  getRuntimeProfile as selectRuntimeProfile
} from "./session-data.js";
import { renderPreflightPanel as renderPreflightView, renderSetupWizard as renderSetupView } from "./setup-view.js";
import {
  appendLogEntry,
  renderAssistChips,
  renderSessionSummary as renderTurnSurfaceSummary,
  renderTurnOptions
} from "./turn-surface.js";

let activeFatalUiError: FatalUiErrorState | null = null;

registerGlobalErrorHandlers(window, renderAppFatalError);

try {
  initializeApp();
} catch (error) {
  renderAppFatalError(createFatalUiErrorState(error));
}

function initializeApp(): void {
  const logEl = getElement<HTMLElement>("log");
  const formEl = getElement<HTMLFormElement>("input-form");
  const nameEl = getElement<HTMLInputElement>("player-name");
  const inputEl = getElement<HTMLTextAreaElement>("player-input");
  const sendButtonEl = getElement<HTMLButtonElement>("send-button");
  const optionsEl = getElement<HTMLElement>("options");
  const assistEl = getElement<HTMLElement>("assist");
  const statusPillEl = getElement<HTMLElement>("status-pill");
  const preflightPanelEl = getElement<HTMLElement>("preflight-panel");
  const preflightTitleEl = getElement<HTMLElement>("preflight-title");
  const preflightSummaryEl = getElement<HTMLElement>("preflight-summary");
  const preflightProfileEl = getElement<HTMLElement>("preflight-profile");
  const preflightIssuesEl = getElement<HTMLElement>("preflight-issues");
  const preflightAdvancedEl = getElement<HTMLDetailsElement>("preflight-advanced");
  const preflightAdvancedJsonEl = getElement<HTMLElement>("preflight-advanced-json");
  const runtimeSummaryEl = getElement<HTMLElement>("runtime-summary");
  const sessionSummaryEl = getElement<HTMLElement>("session-summary");
  const profileSummaryEl = getElement<HTMLElement>("profile-summary");
  const connectionDebugEl = getElement<HTMLElement>("connection-debug");
  const stateDebugEl = getElement<HTMLElement>("state-debug");
  const turnDebugEl = getElement<HTMLElement>("turn-debug");
  const refreshSessionButtonEl = getElement<HTMLButtonElement>("refresh-session");
  const newSessionButtonEl = getElement<HTMLButtonElement>("new-session");
  const sessionToolbarEl = getElement<HTMLElement>("session-toolbar");
  const launchPanelEl = getElement<HTMLElement>("launch-panel");
  const launchNewGameButtonEl = getElement<HTMLButtonElement>("launch-new-game");
  const launchResumeButtonEl = getElement<HTMLButtonElement>("launch-resume");
  const launchResumeNoteEl = getElement<HTMLElement>("launch-resume-note");
  const actionFieldEl = getElement<HTMLElement>("action-field");
  const setupTitleEl = getElement<HTMLElement>("setup-title");
  const setupSummaryEl = getElement<HTMLElement>("setup-summary");
  const setupCheckButtonEl = getElement<HTMLButtonElement>("setup-check-button");
  const setupCurrentProfileEl = getElement<HTMLElement>("setup-current-profile");
  const setupSupportedTitleEl = getElement<HTMLElement>("setup-supported-title");
  const setupSupportedSummaryEl = getElement<HTMLElement>("setup-supported-summary");
  const setupLauncherEl = getElement<HTMLElement>("setup-launcher");
  const setupServicesEl = getElement<HTMLElement>("setup-services");
  const setupGuidanceEl = getElement<HTMLElement>("setup-guidance");
  const setupActionsEl = getElement<HTMLElement>("setup-actions");
  const setupAdvancedEl = getElement<HTMLDetailsElement>("setup-advanced");
  const setupAdvancedJsonEl = getElement<HTMLElement>("setup-advanced-json");

  const state: {
    playerId: string;
    playerName: string;
    player: PlayerState | null;
    sessionDebug: SessionDebugPayload | null;
    lastTurnDebug: TurnDebugPayload | null;
    setupStatus: SetupStatus | null;
    setupError: string | null;
    assistTimer: number | null;
    hasEnteredFlow: boolean;
    pending: boolean;
    fatalError: FatalUiErrorState | null;
  } = {
    playerId: localStorage.getItem("playerId") || "",
    playerName: getStoredPlayerName(localStorage),
    player: null,
    sessionDebug: null,
    lastTurnDebug: null,
    setupStatus: null,
    setupError: null,
    assistTimer: null,
    hasEnteredFlow: false,
    pending: false,
    fatalError: activeFatalUiError
  };

  nameEl.value = state.playerName;
  setAssist([], []);
  renderDebugPanels();
  renderLaunchPanel();
  renderSetupWizard();
  renderPlaySurface();
  renderSessionSummary();
  renderPreflightPanel();
  setPending(false);

  function addEntry(label: string, text: string, tone = "neutral"): void {
    appendLogEntry(logEl, { label, text, tone });
  }

  function setStatus(text: string, tone = "idle"): void {
    statusPillEl.textContent = text;
    statusPillEl.dataset.tone = tone;
  }

  function getRuntimePreflight(): RuntimePreflightPayload | null {
    return selectRuntimePreflight(state.setupStatus, state.sessionDebug, state.lastTurnDebug);
  }

  function getRuntimeConfigDiagnostics(): RuntimeConfigDiagnostics | null {
    return selectRuntimeConfigDiagnostics(state.sessionDebug, state.lastTurnDebug);
  }

  function getRuntimeProfile(): RuntimeConfigProfile | null {
    return selectRuntimeProfile(state.sessionDebug, state.lastTurnDebug);
  }

  function getRuntimeLocalGpuSelection(): RuntimeLocalGpuSelection | null {
    return selectRuntimeLocalGpuSelection(state.sessionDebug, state.lastTurnDebug);
  }

  function hasSavedSession(): boolean {
    return Boolean(state.playerId);
  }

  function isSetupReady(): boolean {
    return state.setupStatus?.status === "ready";
  }

  function renderLaunchPanel(): void {
    renderLaunchView(
      {
        launchPanelEl,
        launchNewGameButtonEl,
        launchResumeButtonEl,
        launchResumeNoteEl
      },
      {
        hasEnteredFlow: state.hasEnteredFlow,
        pending: state.pending,
        fatalBlocked: Boolean(state.fatalError || activeFatalUiError),
        hasSavedSession: hasSavedSession(),
        setupStatus: state.setupStatus
      }
    );
  }

  function renderSetupWizard(): void {
    renderSetupView(
      {
        setupTitleEl,
        setupSummaryEl,
        setupCheckButtonEl,
        setupCurrentProfileEl,
        setupSupportedTitleEl,
        setupSupportedSummaryEl,
        setupLauncherEl,
        setupServicesEl,
        setupGuidanceEl,
        setupActionsEl,
        setupAdvancedEl,
        setupAdvancedJsonEl
      },
      {
        setupStatus: state.setupStatus,
        setupError: state.setupError,
        pending: state.pending,
        fatalBlocked: Boolean(state.fatalError || activeFatalUiError)
      }
    );
  }

  function renderPlaySurface(): void {
    const showPlaySurface = state.hasEnteredFlow || Boolean(state.player || state.sessionDebug || state.lastTurnDebug);

    sessionToolbarEl.hidden = !showPlaySurface;
    logEl.hidden = !showPlaySurface;
    actionFieldEl.hidden = !showPlaySurface;
    sendButtonEl.hidden = !showPlaySurface;
    assistEl.hidden = !showPlaySurface;
    optionsEl.hidden = !showPlaySurface;
  }

  function setOptions(options: string[] = []): void {
    renderTurnOptions(optionsEl, {
      options,
      disabled: state.pending || Boolean(state.fatalError || activeFatalUiError),
      onSelect(option) {
        inputEl.value = option;
        inputEl.focus();
        requestAssist().catch(() => {
          setAssist([], []);
        });
      }
    });
  }

  function setAssist(
    corrections: Array<{ token: string; suggestions: string[] }> = [],
    completions: string[] = []
  ): void {
    renderAssistChips(assistEl, {
      corrections,
      completions,
      onCorrectionSelect(token, suggestion) {
          replaceToken(token, suggestion);
          requestAssist().catch(() => {
            setAssist([], []);
          });
      },
      onCompletionSelect(word) {
          applyCompletion(word);
          requestAssist().catch(() => {
            setAssist([], []);
          });
      }
    });
  }

  function rememberPlayerName(): void {
    state.playerName = persistPlayerName(localStorage, nameEl.value);
  }

  function replaceToken(token: string, replacement: string): void {
    const safeToken = escapeRegExp(token);
    const regex = new RegExp(`\\b${safeToken}\\b`);
    inputEl.value = inputEl.value.replace(regex, replacement);
    inputEl.focus();
  }

  function applyCompletion(completion: string): void {
    inputEl.value = inputEl.value.replace(/[A-Za-z']+$/, completion);
    inputEl.focus();
  }

  function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderDebugPanels(): void {
    renderDebugView(
      {
        connectionDebugEl,
        stateDebugEl,
        turnDebugEl
      },
      {
        setupStatus: state.setupStatus,
        sessionDebug: state.sessionDebug,
        lastTurnDebug: state.lastTurnDebug,
        player: state.player,
        fatalError: state.fatalError,
        activeFatalUiError
      }
    );
  }

  function renderPreflightPanel(): void {
    renderPreflightView(
      {
        preflightPanelEl,
        preflightTitleEl,
        preflightSummaryEl,
        preflightProfileEl,
        preflightIssuesEl,
        preflightAdvancedEl,
        preflightAdvancedJsonEl
      },
      {
        preflight: getRuntimePreflight(),
        diagnostics: getRuntimeConfigDiagnostics(),
        profile: getRuntimeProfile(),
        setupStatus: state.setupStatus,
        localGpu: getRuntimeLocalGpuSelection()
      }
    );
  }

  function renderSessionSummary(): void {
    renderTurnSurfaceSummary(
      {
        runtimeSummaryEl,
        sessionSummaryEl,
        profileSummaryEl
      },
      {
        player: state.player,
        sessionDebug: state.sessionDebug,
        lastTurnDebug: state.lastTurnDebug,
        setupStatus: state.setupStatus,
        profile: getRuntimeProfile(),
        localGpu: getRuntimeLocalGpuSelection(),
        diagnostics: getRuntimeConfigDiagnostics(),
        preflight: getRuntimePreflight(),
        hasEnteredFlow: state.hasEnteredFlow,
        hasSavedSession: hasSavedSession()
      }
    );
  }

  function updateSessionData(data: StateApiResponse): void {
    state.sessionDebug = data.debug || state.sessionDebug;

    if (!data.player) {
      state.player = null;
      renderLaunchPanel();
      renderPlaySurface();
      renderSessionSummary();
      renderPreflightPanel();
      renderDebugPanels();
      setPending(state.pending);
      return;
    }

    state.player = data.player;
    state.playerId = data.player.id;

    localStorage.setItem("playerId", state.playerId);
    if (!nameEl.value.trim()) {
      nameEl.value = data.player.name;
    }
    rememberPlayerName();
    renderLaunchPanel();
    renderPlaySurface();
    renderSessionSummary();
    renderPreflightPanel();
    renderDebugPanels();
    setPending(state.pending);
  }

  async function loadSetupStatus({ force = false } = {}): Promise<void> {
    const suffix = force ? "?refresh=1" : "";
    const result = await fetchJson<SetupStatusPayload>(`/api/setup/status${suffix}`);
    if (!result.ok || !result.data?.setup) {
      throw new Error(formatErrorMessage(result.data, `Setup request failed (${result.status})`));
    }

    state.setupStatus = result.data.setup;
    state.setupError = null;
    renderLaunchPanel();
    renderSetupWizard();
    renderSessionSummary();
    renderPreflightPanel();
    renderDebugPanels();
  }

  async function ensurePlayer({ force = false, showStatus = false } = {}): Promise<PlayerState | null> {
    if (state.fatalError || activeFatalUiError) {
      return null;
    }

    if (!force && state.playerId && state.player) {
      rememberPlayerName();
      return state.player;
    }

    if (showStatus) setStatus("Loading session", "working");

    rememberPlayerName();
    const params = new URLSearchParams();
    if (state.playerId) params.set("playerId", state.playerId);
    if (nameEl.value.trim()) params.set("name", nameEl.value.trim());

    const result = await fetchJson<StateApiResponse>(`/api/state?${params.toString()}`);
    if (!result.ok) {
      const message = formatErrorMessage(result.data, `State request failed (${result.status})`);
      throw new Error(message);
    }

    updateSessionData(result.data);

    const preflight = getRuntimePreflight();

    if (!state.player) {
      if (preflight?.status === "action-required") {
        if (showStatus) {
          setStatus("Setup required", "error");
        }
        return null;
      }

      throw new Error("Player initialization failed.");
    }

    if (showStatus) {
      if (preflight?.status === "action-required") {
        setStatus("Setup required", "error");
      } else if (preflight?.status === "checking") {
        setStatus("Checking AI setup", "working");
      } else {
        setStatus("Session ready", "ok");
      }
    }
    return state.player;
  }

  function clearSessionView({ clearSavedPlayerId }: { clearSavedPlayerId: boolean }): void {
    if (clearSavedPlayerId) {
      localStorage.removeItem("playerId");
      state.playerId = "";
    }

    state.player = null;
    state.sessionDebug = null;
    state.lastTurnDebug = null;
    logEl.innerHTML = "";
    setOptions([]);
    setAssist([], []);
    renderLaunchPanel();
    renderPlaySurface();
    renderSessionSummary();
    renderPreflightPanel();
    renderDebugPanels();
  }

  async function startGameFlow(mode: "new" | "resume"): Promise<void> {
    if (state.pending || state.fatalError || activeFatalUiError) {
      return;
    }

    if (mode === "resume" && !hasSavedSession()) {
      setStatus("No saved game to resume", "error");
      return;
    }

    setPending(true);
    setStatus(mode === "resume" ? "Resuming game" : "Starting new game", "working");

    try {
      if (!isSetupReady()) {
        await loadSetupStatus({ force: true });
      }

      if (!isSetupReady()) {
        setStatus("Setup required", "error");
        return;
      }

      state.hasEnteredFlow = true;
      clearSessionView({ clearSavedPlayerId: mode === "new" });
      setPending(true);

      const player = await ensurePlayer({ force: true });
      if (!player) {
        setStatus("Setup required", "error");
        return;
      }

      const guideMessage =
        mode === "resume"
          ? `Back in ${player.location}. Continue where you left off or try "look around" to get your bearings.`
          : `${player.name} arrives in ${player.location}. Try "look around" or any short action to begin.`;
      addEntry("Guide", guideMessage, "system");
      setStatus(mode === "resume" ? "Game resumed" : "New game ready", "ok");
    } catch (error) {
      addEntry("System", error instanceof Error ? error.message : "Session start failed.", "system");
      setStatus(mode === "resume" ? "Resume failed" : "Start failed", "error");
    } finally {
      setPending(false);
      if (state.player && !state.fatalError && !activeFatalUiError) {
        inputEl.focus();
      }
    }
  }

  async function requestAssist(): Promise<void> {
    if (state.pending || state.fatalError || activeFatalUiError || !state.hasEnteredFlow || !state.player) return;

    const input = inputEl.value.trim();
    if (!input) {
      setAssist([], []);
      return;
    }

    try {
      const player = await ensurePlayer();
      if (!player) return;
      const result = await fetchJson<AssistApiResponse>("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: state.playerId,
          name: nameEl.value.trim(),
          input
        })
      });

      if (!result.ok) return;
      setAssist(result.data.corrections || [], result.data.completions || []);
    } catch {
      setAssist([], []);
    }
  }

  function setPending(pending: boolean): void {
    state.pending = pending;
    const preflight = getRuntimePreflight();
    const setupBlocked = preflight?.status === "action-required";
    const fatalBlocked = Boolean(state.fatalError || activeFatalUiError);
    const readyForTurns = state.hasEnteredFlow && Boolean(state.player) && !setupBlocked && !fatalBlocked && !pending;

    renderLaunchPanel();
    renderSetupWizard();
    renderPlaySurface();

    sendButtonEl.disabled = !readyForTurns;
    inputEl.disabled = !readyForTurns;
    nameEl.disabled = pending || fatalBlocked;
    refreshSessionButtonEl.disabled = pending || fatalBlocked || !state.hasEnteredFlow;
    newSessionButtonEl.disabled = pending || fatalBlocked || !state.hasEnteredFlow;

    Array.from(optionsEl.querySelectorAll("button")).forEach((button) => {
      button.disabled = !readyForTurns;
    });
  }

  function handleFatalError(stateUpdate: FatalUiErrorState): void {
    state.fatalError = stateUpdate;
    renderAppFatalError(stateUpdate);
    renderDebugPanels();
    setPending(false);
  }

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.pending || state.fatalError || activeFatalUiError || !state.hasEnteredFlow) return;

    const input = inputEl.value.trim();
    if (!input) return;

    setPending(true);
    setStatus("Sending turn", "working");

    try {
      const player = await ensurePlayer();
      if (!player) {
        setStatus("Setup required", "error");
        return;
      }
      addEntry("You", input, "player");
      inputEl.value = "";
      setAssist([], []);

      const result = await fetchJson<TurnApiResponse>("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: state.playerId,
          name: nameEl.value.trim(),
          input
        })
      });

      if (result.data?.debug) {
        state.lastTurnDebug = result.data.debug;
        state.sessionDebug = {
          runtime: result.data.debug.runtime,
          session: result.data.debug.session
        };
      }
      if (result.data?.player) {
        state.player = result.data.player;
      }
      renderSessionSummary();
      renderPreflightPanel();
      renderDebugPanels();

      if (!result.ok) {
        const message = formatErrorMessage(result.data, `Turn request failed (${result.status})`);
        addEntry("System", message, "system");
        setStatus("Turn failed", "error");
        return;
      }

      addEntry("Narrator", result.data.narrative || "No narrative returned.", "narrator");
      setOptions(result.data.player_options || []);
      const latency = typeof result.data.debug?.turn?.latency_ms === "number" ? result.data.debug.turn.latency_ms : undefined;
      setStatus(typeof latency === "number" ? `Turn complete in ${latency} ms` : "Turn complete", "ok");
    } catch (error) {
      addEntry("System", error instanceof Error ? error.message : "Request failed.", "system");
      setStatus("Request failed", "error");
    } finally {
      setPending(false);
      if (state.player && !state.fatalError && !activeFatalUiError) {
        inputEl.focus();
      }
    }
  });

  inputEl.addEventListener("input", () => {
    if (state.assistTimer !== null) {
      window.clearTimeout(state.assistTimer);
    }
    state.assistTimer = window.setTimeout(() => {
      requestAssist().catch(() => {
        setAssist([], []);
      });
    }, 250);
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formEl.requestSubmit();
    }
  });

  nameEl.addEventListener("change", rememberPlayerName);
  nameEl.addEventListener("blur", rememberPlayerName);

  setupActionsEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const actionId = target.dataset.recoveryAction;
    if (!actionId) return;

    void runRecoveryAction(actionId);
  });

  preflightIssuesEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const actionId = target.dataset.recoveryAction;
    if (!actionId) return;

    void runRecoveryAction(actionId);
  });

  setupCheckButtonEl.addEventListener("click", async () => {
    await runSetupCheck();
  });

  launchNewGameButtonEl.addEventListener("click", () => {
    startGameFlow("new").catch((error) => {
      addEntry("System", error instanceof Error ? error.message : "Failed to start a new game.", "system");
      setStatus("Start failed", "error");
      setPending(false);
    });
  });

  launchResumeButtonEl.addEventListener("click", () => {
    startGameFlow("resume").catch((error) => {
      addEntry("System", error instanceof Error ? error.message : "Failed to resume the saved game.", "system");
      setStatus("Resume failed", "error");
      setPending(false);
    });
  });

  refreshSessionButtonEl.addEventListener("click", async () => {
    if (state.fatalError || activeFatalUiError || !state.hasEnteredFlow) return;

    try {
      setPending(true);
      setStatus("Refreshing game", "working");
      const player = await ensurePlayer({ force: true });
      if (player) {
        addEntry("System", "Game state refreshed.", "system");
      }
      const preflight = getRuntimePreflight();
      if (preflight?.status === "action-required") {
        setStatus("Setup required", "error");
      } else if (preflight?.status === "checking") {
        setStatus("Checking AI setup", "working");
      } else {
        setStatus("Session ready", "ok");
      }
    } catch (error) {
      addEntry("System", error instanceof Error ? error.message : "Refresh failed.", "system");
      setStatus("Refresh failed", "error");
    } finally {
      setPending(false);
    }
  });

  newSessionButtonEl.addEventListener("click", async () => {
    if (state.fatalError || activeFatalUiError || !state.hasEnteredFlow) return;

    await startGameFlow("new");
  });

  async function bootstrap(): Promise<void> {
    setPending(true);
    setStatus("Checking supported setup", "working");
    try {
      await loadSetupStatus();
      if (isSetupReady()) {
        setStatus(hasSavedSession() ? "Resume or start new" : "Start a new game", "idle");
      } else {
        setStatus("Setup required", "error");
      }
    } catch (error) {
      state.setupError = error instanceof Error ? error.message : "Setup check failed.";
      renderSetupWizard();
      setStatus("Setup check failed", "error");
    } finally {
      setPending(false);
    }
    nameEl.focus();
  }

  bootstrap().catch((error) => {
    handleFatalError(createFatalUiErrorState(error));
  });

  async function runSetupCheck(): Promise<void> {
    if (state.fatalError || activeFatalUiError) return;

    try {
      setPending(true);
      setStatus("Checking AI setup", "working");
      await loadSetupStatus({ force: true });
      if (isSetupReady()) {
        setStatus("Setup ready", "ok");
      } else {
        setStatus("Setup required", "error");
      }
    } catch (error) {
      state.setupError = error instanceof Error ? error.message : "Setup check failed.";
      renderSetupWizard();
      setStatus("Setup check failed", "error");
    } finally {
      setPending(false);
    }
  }

  async function runRecoveryAction(actionId: string): Promise<void> {
    switch (actionId) {
      case "retry-setup-check": {
        await runSetupCheck();
        return;
      }
      case "copy-launcher-command": {
        const launcher = state.setupStatus?.supported_path?.launcher;
        if (!launcher) {
          setStatus("Launcher command unavailable", "error");
          return;
        }
        await copyRecoveryText(launcher, "Launcher command copied");
        return;
      }
      case "copy-smaller-profile-guidance": {
        const guidance = [
          "Use the conservative supported profile for the next launcher run:",
          "AI_PROFILE=local-gpu-small",
          "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -Rebuild"
        ].join("\n");
        await copyRecoveryText(guidance, "Smaller-profile guidance copied");
        return;
      }
      case "copy-gpu-repair-checklist": {
        const checklist = [
          "GPU-backed repair checklist:",
          "1. Start Docker Desktop and wait for the Linux engine.",
          "2. Confirm nvidia-smi works in PowerShell.",
          "3. Re-run the supported launcher path.",
          "4. Retry the setup check without clearing the saved browser session.",
          state.setupStatus?.supported_path?.launcher || "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1"
        ].join("\n");
        await copyRecoveryText(checklist, "GPU repair checklist copied");
        return;
      }
      default:
        return;
    }
  }

  async function copyRecoveryText(text: string, successStatus: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        copyTextWithFallback(text);
      }
      addEntry("System", successStatus, "system");
      setStatus(successStatus, "ok");
    } catch {
      setStatus("Copy failed", "error");
      addEntry("System", "Copy failed. Open the advanced setup details and copy the text manually.", "system");
    }
  }

  function copyTextWithFallback(text: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function renderAppFatalError(state: FatalUiErrorState): void {
  activeFatalUiError = state;
  const panel = document.getElementById("fatal-error-panel");
  const titleEl = document.getElementById("fatal-error-title");
  const summaryEl = document.getElementById("fatal-error-summary");
  const detailEl = document.getElementById("fatal-error-detail");
  const recoveryEl = document.getElementById("fatal-error-recovery");
  const statusPillEl = document.getElementById("status-pill");
  const logEl = document.getElementById("log");

  if (panel instanceof HTMLElement) {
    panel.hidden = false;
  }

  if (titleEl instanceof HTMLElement) {
    titleEl.textContent = state.title;
  }

  if (summaryEl instanceof HTMLElement) {
    summaryEl.textContent = state.summary;
  }

  if (detailEl instanceof HTMLElement) {
    detailEl.textContent = state.detail;
  }

  if (recoveryEl instanceof HTMLElement) {
    recoveryEl.textContent = state.recovery;
  }

  if (statusPillEl instanceof HTMLElement) {
    statusPillEl.textContent = state.title;
    statusPillEl.dataset.tone = "error";
  }

  if (logEl instanceof HTMLElement && !logEl.dataset.fatalErrorLogged) {
    const entry = document.createElement("article");
    entry.className = "entry system";

    const title = document.createElement("strong");
    title.textContent = "System";

    const body = document.createElement("div");
    body.textContent = `${state.summary} ${state.recovery}`;

    entry.appendChild(title);
    entry.appendChild(body);
    logEl.appendChild(entry);
    logEl.dataset.fatalErrorLogged = "true";
  }

  disableInteractiveControls();
}

function disableInteractiveControls(): void {
  const ids = ["player-name", "player-input", "send-button", "refresh-session", "new-session", "launch-new-game", "launch-resume"];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLButtonElement
    ) {
      element.disabled = true;
    }
  });

  Array.from(document.querySelectorAll("#options button")).forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
    }
  });
}
