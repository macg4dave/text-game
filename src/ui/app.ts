import { createFatalUiErrorState, registerGlobalErrorHandlers, type FatalUiErrorState } from "./global-error.js";

interface PlayerState {
  id: string;
  name: string;
  location: string;
  director_state?: {
    current_beat_label?: string;
  };
  [key: string]: unknown;
}

interface SessionDebugPayload {
  runtime?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
}

interface RuntimePreflightIssue {
  severity?: string;
  title?: string;
  message?: string;
  recovery?: string[];
  recommended_fix?: string | null;
  env_vars?: string[];
  details?: Record<string, unknown> | null;
}

interface RuntimePreflightPayload {
  ok?: boolean;
  status?: string;
  summary?: string;
  issues?: RuntimePreflightIssue[];
}

interface RuntimeConfigProfile {
  id?: string;
  label?: string;
  description?: string;
  recommended_ai_stack?: string | null;
  override_count?: number;
}

interface RuntimeLocalGpuSelection {
  requested?: boolean;
  requested_profile?: string | null;
  status?: string | null;
  selection_source?: string | null;
  profile_id?: string | null;
  profile_label?: string | null;
  verification_status?: string | null;
  detected_vram_gb?: number | null;
  manual_vram_gb?: number | null;
  chat_model?: string | null;
  embedding_mode?: string | null;
  embedding_model?: string | null;
  message?: string | null;
  notes?: string[];
}

interface RuntimeConfigDiagnosticsProfile {
  value?: string;
  label?: string;
  description?: string;
  recommended_ai_stack?: string | null;
  source?: string;
  env_var?: string | null;
}

interface RuntimeConfigDiagnosticsOverride {
  field?: string;
  source?: string;
  env_var?: string | null;
}

interface RuntimeConfigDiagnostics {
  profile?: RuntimeConfigDiagnosticsProfile;
  profile_overrides?: RuntimeConfigDiagnosticsOverride[];
}

interface TurnDebugPayload extends SessionDebugPayload {
  request_id?: string | null;
  turn?: Record<string, unknown> | null;
}

interface StateApiResponse {
  player?: PlayerState | null;
  debug?: SessionDebugPayload;
  error?: string;
  detail?: string | string[];
}

interface AssistApiResponse {
  corrections?: Array<{ token: string; suggestions: string[] }>;
  completions?: string[];
}

interface TurnApiResponse extends StateApiResponse {
  narrative?: string;
  player_options?: string[];
  state_updates?: Record<string, unknown>;
  director_updates?: Record<string, unknown>;
  debug?: TurnDebugPayload;
}

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

  const state: {
    playerId: string;
    playerName: string;
    player: PlayerState | null;
    sessionDebug: SessionDebugPayload | null;
    lastTurnDebug: TurnDebugPayload | null;
    assistTimer: number | null;
    hasEnteredFlow: boolean;
    pending: boolean;
    fatalError: FatalUiErrorState | null;
  } = {
    playerId: localStorage.getItem("playerId") || "",
    playerName: localStorage.getItem("playerName") || "",
    player: null,
    sessionDebug: null,
    lastTurnDebug: null,
    assistTimer: null,
    hasEnteredFlow: false,
    pending: false,
    fatalError: activeFatalUiError
  };

  nameEl.value = state.playerName;
  setAssist([], []);
  renderDebugPanels();
  renderLaunchPanel();
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
    const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
    if (!runtime || typeof runtime !== "object") {
      return null;
    }

    const candidate = (runtime as { preflight?: unknown }).preflight;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    return candidate as RuntimePreflightPayload;
  }

  function getRuntimeConfigDiagnostics(): RuntimeConfigDiagnostics | null {
    const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
    if (!runtime || typeof runtime !== "object") {
      return null;
    }

    const candidate = (runtime as { config_diagnostics?: unknown }).config_diagnostics;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    return candidate as RuntimeConfigDiagnostics;
  }

  function getRuntimeProfile(): RuntimeConfigProfile | null {
    const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
    if (!runtime || typeof runtime !== "object") {
      return null;
    }

    const candidate = (runtime as { profile?: unknown }).profile;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    return candidate as RuntimeConfigProfile;
  }

  function getRuntimeLocalGpuSelection(): RuntimeLocalGpuSelection | null {
    const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
    if (!runtime || typeof runtime !== "object") {
      return null;
    }

    const candidate = (runtime as { local_gpu?: unknown }).local_gpu;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    return candidate as RuntimeLocalGpuSelection;
  }

  function formatLocalGpuSummary(selection: RuntimeLocalGpuSelection | null): string | null {
    if (!selection || !selection.requested) {
      return null;
    }

    const label = selection.profile_label || selection.profile_id || "Local GPU profile";
    const source = selection.selection_source ? selection.selection_source.replace(/-/g, " ") : "local GPU";
    const vram = typeof selection.detected_vram_gb === "number" ? `${selection.detected_vram_gb} GB detected` : null;
    const parts = [label, source, vram].filter((value): value is string => Boolean(value));
    return parts.join(" | ");
  }

  function hasSavedSession(): boolean {
    return Boolean(state.playerId);
  }

  function renderLaunchPanel(): void {
    const fatalBlocked = Boolean(state.fatalError || activeFatalUiError);
    const resumeAvailable = hasSavedSession();

    launchPanelEl.hidden = state.hasEnteredFlow || fatalBlocked;
    launchNewGameButtonEl.disabled = state.pending || fatalBlocked;
    launchResumeButtonEl.disabled = state.pending || fatalBlocked || !resumeAvailable;
    launchResumeNoteEl.textContent = resumeAvailable
      ? "Resume uses the last game saved in this browser."
      : "No saved game is stored in this browser yet. Start a new game to begin.";
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
    const name = nameEl.value.trim();
    if (name) {
      localStorage.setItem("playerName", name);
    } else {
      localStorage.removeItem("playerName");
    }
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

  function formatJson(value: unknown, fallbackMessage: string): string {
    if (value === null || value === undefined) {
      return JSON.stringify({ message: fallbackMessage }, null, 2);
    }

    return JSON.stringify(value, null, 2);
  }

  function renderDebugPanels(): void {
    const connectionSnapshot = {
      runtime: state.sessionDebug?.runtime || state.lastTurnDebug?.runtime || null,
      session: state.sessionDebug?.session || state.lastTurnDebug?.session || null,
      last_request_id: state.lastTurnDebug?.request_id || null,
      fatal_error: state.fatalError || activeFatalUiError
    };

    connectionDebugEl.textContent = formatJson(connectionSnapshot, "Session data will appear here.");
    stateDebugEl.textContent = formatJson(state.player, "Player state will appear here.");
    turnDebugEl.textContent = formatJson(state.lastTurnDebug, "Turn debug will appear here after the first request.");
  }

  function renderPreflightPanel(): void {
    const preflight = getRuntimePreflight();
    const diagnostics = getRuntimeConfigDiagnostics();
    const localGpu = getRuntimeLocalGpuSelection();
    if (!preflight || (preflight.ok && !(preflight.issues || []).length)) {
      preflightPanelEl.hidden = true;
      preflightSummaryEl.textContent = "";
      preflightProfileEl.textContent = "";
      preflightIssuesEl.innerHTML = "";
      preflightAdvancedEl.hidden = true;
      preflightAdvancedEl.open = false;
      preflightAdvancedJsonEl.textContent = "";
      return;
    }

    preflightPanelEl.hidden = false;
    preflightTitleEl.textContent = preflight.status === "checking" ? "Checking setup" : "Setup required";
    preflightSummaryEl.textContent = preflight.summary || "The app needs setup changes before the first turn.";
    const profileLabel = diagnostics?.profile?.label || getRuntimeProfile()?.label || "Setup profile";
    const overrideCount = diagnostics?.profile_overrides?.length || 0;
    const localGpuSummary = formatLocalGpuSummary(localGpu);
    preflightProfileEl.textContent = overrideCount
      ? `${profileLabel} with ${overrideCount} advanced override${overrideCount === 1 ? "" : "s"}.${localGpuSummary ? ` ${localGpuSummary}.` : ""}`
      : `${profileLabel} is active.${localGpuSummary ? ` ${localGpuSummary}.` : ""}`;
    preflightIssuesEl.innerHTML = "";
    const advancedIssues: Array<Record<string, unknown>> = [];

    (preflight.issues || []).forEach((issue) => {
      const item = document.createElement("li");
      const severity = typeof issue.severity === "string" ? `[${issue.severity.toUpperCase()}] ` : "";
      const parts = [issue.title, issue.message].filter((value): value is string => Boolean(value));
      const recovery = Array.isArray(issue.recovery) ? issue.recovery.filter(Boolean) : [];
      const recommendedFix = issue.recommended_fix || recovery[0] || "";
      item.textContent = recommendedFix
        ? `${severity}${parts.join(": ")} Recommended next step: ${recommendedFix}`
        : `${severity}${parts.join(": ")}`;
      preflightIssuesEl.appendChild(item);

      if (issue.details || (issue.env_vars && issue.env_vars.length)) {
        advancedIssues.push({
          title: issue.title || null,
          severity: issue.severity || null,
          env_vars: issue.env_vars || [],
          details: issue.details || null
        });
      }
    });

    if (advancedIssues.length) {
      preflightAdvancedEl.hidden = false;
      preflightAdvancedJsonEl.textContent = JSON.stringify(
        {
          status: preflight.status || null,
          summary: preflight.summary || null,
          issues: advancedIssues
        },
        null,
        2
      );
    } else {
      preflightAdvancedEl.hidden = true;
      preflightAdvancedEl.open = false;
      preflightAdvancedJsonEl.textContent = "";
    }
  }

  function renderSessionSummary(): void {
    const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
    const session = state.sessionDebug?.session || state.lastTurnDebug?.session;
    const preflight = getRuntimePreflight();
    const profile = getRuntimeProfile();
    const localGpu = getRuntimeLocalGpuSelection();
    const diagnostics = getRuntimeConfigDiagnostics();
    const beat = state.player?.director_state?.current_beat_label;

    const runtimeParts: string[] = [];
    if (runtime && typeof runtime.provider === "string") runtimeParts.push(runtime.provider);
    if (runtime && typeof runtime.chat_model === "string") runtimeParts.push(runtime.chat_model);
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

  async function fetchJson<T>(url: string, options?: RequestInit): Promise<{
    ok: boolean;
    status: number;
    data: T;
    requestId: string | null;
  }> {
    const response = await fetch(url, options);
    const rawText = await response.text();
    let data: unknown = {};

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { error: rawText };
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data: data as T,
      requestId: response.headers.get("x-request-id")
    };
  }

  function formatErrorMessage(data: { detail?: string | string[]; error?: string } | undefined, fallback: string): string {
    if (!data) return fallback;
    if (Array.isArray(data.detail)) return data.detail.join(", ");
    return data.detail || data.error || fallback;
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

    state.hasEnteredFlow = true;
    clearSessionView({ clearSavedPlayerId: mode === "new" });
    setPending(true);
    setStatus(mode === "resume" ? "Resuming game" : "Starting new game", "working");

    try {
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
    setStatus(hasSavedSession() ? "Resume or start new" : "Start a new game", "idle");
    nameEl.focus();
  }

  bootstrap().catch((error) => {
    handleFatalError(createFatalUiErrorState(error));
  });
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
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
