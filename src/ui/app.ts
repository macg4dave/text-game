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
import { getStoredPlayerName, rememberPlayerName as persistPlayerName } from "./player-name.js";
import {
  formatLocalGpuSummary,
  getRuntimeConfigDiagnostics as selectRuntimeConfigDiagnostics,
  getRuntimeLocalGpuSelection as selectRuntimeLocalGpuSelection,
  getRuntimePreflight as selectRuntimePreflight,
  getRuntimeProfile as selectRuntimeProfile
} from "./session-data.js";
import { renderPreflightPanel as renderPreflightView, renderSetupWizard as renderSetupView } from "./setup-view.js";

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
    const entry = document.createElement("article");
    entry.className = `entry ${tone}`;

    const title = document.createElement("strong");
    title.textContent = label;

    const body = document.createElement("div");
    body.textContent = text;

    entry.appendChild(title);
    entry.appendChild(body);
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
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
    const fatalBlocked = Boolean(state.fatalError || activeFatalUiError);
    const resumeAvailable = hasSavedSession();
    const setupReady = isSetupReady();
    const setupKnown = Boolean(state.setupStatus);

    launchPanelEl.hidden = state.hasEnteredFlow || fatalBlocked;
    launchNewGameButtonEl.disabled = state.pending || fatalBlocked || !setupKnown || !setupReady;
    launchResumeButtonEl.disabled = state.pending || fatalBlocked || !setupKnown || !setupReady || !resumeAvailable;
    launchResumeNoteEl.textContent = !setupKnown
      ? "Finish the setup check before starting."
      : !setupReady
        ? "Fix the setup items below, then run the connection test again."
        : resumeAvailable
          ? "Resume uses the last game saved in this browser."
          : "No saved game is stored in this browser yet. Start a new game to begin.";
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
        setupGuidanceEl
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
    optionsEl.innerHTML = "";

    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.disabled = state.pending || Boolean(state.fatalError || activeFatalUiError);
      button.addEventListener("click", () => {
        inputEl.value = option;
        inputEl.focus();
        requestAssist().catch(() => {
          setAssist([], []);
        });
      });
      optionsEl.appendChild(button);
    });
  }

  function setAssist(
    corrections: Array<{ token: string; suggestions: string[] }> = [],
    completions: string[] = []
  ): void {
    assistEl.innerHTML = "";

    if (!corrections.length && !completions.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "assist-placeholder";
      placeholder.textContent = "Local assist suggestions appear here.";
      assistEl.appendChild(placeholder);
      return;
    }

    if (corrections.length) {
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = "Spelling";
      assistEl.appendChild(label);

      corrections.forEach((item) => {
        const suggestion = item.suggestions[0];
        if (!suggestion) return;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = `${item.token} -> ${suggestion}`;
        chip.addEventListener("click", () => {
          replaceToken(item.token, suggestion);
          requestAssist().catch(() => {
            setAssist([], []);
          });
        });
        assistEl.appendChild(chip);
      });
    }

    if (completions.length) {
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = "Complete";
      assistEl.appendChild(label);

      completions.forEach((word) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = word;
        chip.addEventListener("click", () => {
          applyCompletion(word);
          requestAssist().catch(() => {
            setAssist([], []);
          });
        });
        assistEl.appendChild(chip);
      });
    }
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
    const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
    const session = state.sessionDebug?.session || state.lastTurnDebug?.session;
    const preflight = getRuntimePreflight();
    const profile = getRuntimeProfile();
    const localGpu = getRuntimeLocalGpuSelection();
    const diagnostics = getRuntimeConfigDiagnostics();
    const setupProfile = state.setupStatus?.current_profile;
    const beat = state.player?.director_state?.current_beat_label;

    const runtimeParts: string[] = [];
    if (runtime && typeof runtime.provider === "string") runtimeParts.push(runtime.provider);
    if (runtime && typeof runtime.chat_model === "string") runtimeParts.push(runtime.chat_model);
    if (!runtime && setupProfile?.provider) runtimeParts.push(setupProfile.provider);
    if (!runtime && setupProfile?.chat_model) runtimeParts.push(setupProfile.chat_model);
    if (localGpu?.profile_label) runtimeParts.push(localGpu.profile_label);
    if (preflight?.status === "action-required") runtimeParts.push("setup required");
    if (preflight?.status === "checking") runtimeParts.push("checking AI");
    if (session && typeof session.player_id === "string") runtimeParts.push(`player ${session.player_id.slice(0, 8)}`);
    runtimeSummaryEl.textContent = runtimeParts.length
      ? runtimeParts.join(" / ")
      : hasSavedSession()
        ? "Saved game ready to resume"
        : "Choose a start option";
    const overrideCount = diagnostics?.profile_overrides?.length || 0;
    const localGpuSummary = formatLocalGpuSummary(localGpu);
    profileSummaryEl.textContent = profile
      ? `${profile.label || profile.id || "Setup profile"}${overrideCount ? ` | ${overrideCount} override${overrideCount === 1 ? "" : "s"}` : ""}${localGpuSummary ? ` | ${localGpuSummary}` : ""}`
      : setupProfile
        ? `${setupProfile.label || setupProfile.id || "Setup profile"}${localGpuSummary ? ` | ${localGpuSummary}` : ""}`
        : localGpuSummary || (state.hasEnteredFlow ? "Setup profile loading..." : "No session loaded yet.");

    if (!state.player) {
      sessionSummaryEl.textContent = state.hasEnteredFlow
        ? "Waiting for the opening scene."
        : hasSavedSession()
          ? "Resume the last game saved in this browser or start over with a new run."
          : "Choose a name and start when you're ready.";
      return;
    }

    const details = [`${state.player.name} in ${state.player.location}`];
    if (beat) details.push(`beat: ${beat}`);
    sessionSummaryEl.textContent = details.join(" | ");
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

  setupCheckButtonEl.addEventListener("click", async () => {
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
