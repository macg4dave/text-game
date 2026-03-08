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
  code?: string;
  area?: string;
  severity?: "blocker" | "warning" | "info";
  title?: string;
  message?: string;
  recovery?: string[];
  recommended_fix?: string | null;
  details?: Record<string, unknown> | null;
}

interface RuntimePreflightCounts {
  blocker?: number;
  warning?: number;
  info?: number;
}

interface RuntimePreflightPayload {
  ok?: boolean;
  status?: "ready" | "action-required" | "checking" | string;
  summary?: string;
  issues?: RuntimePreflightIssue[];
  counts?: RuntimePreflightCounts;
}

interface TurnDebugPayload extends SessionDebugPayload {
  request_id?: string | null;
  turn?: Record<string, unknown> | null;
}

interface StateApiResponse {
  player?: PlayerState;
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

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}

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
const preflightIssuesEl = getElement<HTMLElement>("preflight-issues");
const preflightAdvancedEl = getElement<HTMLDetailsElement>("preflight-advanced");
const preflightAdvancedJsonEl = getElement<HTMLElement>("preflight-advanced-json");
const runtimeSummaryEl = getElement<HTMLElement>("runtime-summary");
const sessionSummaryEl = getElement<HTMLElement>("session-summary");
const connectionDebugEl = getElement<HTMLElement>("connection-debug");
const stateDebugEl = getElement<HTMLElement>("state-debug");
const turnDebugEl = getElement<HTMLElement>("turn-debug");
const refreshSessionButtonEl = getElement<HTMLButtonElement>("refresh-session");
const newSessionButtonEl = getElement<HTMLButtonElement>("new-session");

const state: {
  playerId: string;
  playerName: string;
  player: PlayerState | null;
  sessionDebug: SessionDebugPayload | null;
  lastTurnDebug: TurnDebugPayload | null;
  assistTimer: number | null;
  pending: boolean;
} = {
  playerId: localStorage.getItem("playerId") || "",
  playerName: localStorage.getItem("playerName") || "",
  player: null,
  sessionDebug: null,
  lastTurnDebug: null,
  assistTimer: null,
  pending: false
};

nameEl.value = state.playerName;
renderDebugPanels();
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

function hasBlockingPreflight(preflight: RuntimePreflightPayload | null): boolean {
  return (preflight?.counts?.blocker || 0) > 0 || preflight?.status === "action-required";
}

function setOptions(options: string[] = []): void {
  optionsEl.innerHTML = "";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.disabled = state.pending;
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
    last_request_id: state.lastTurnDebug?.request_id || null
  };

  connectionDebugEl.textContent = formatJson(connectionSnapshot, "Session data will appear here.");
  stateDebugEl.textContent = formatJson(state.player, "Player state will appear here.");
  turnDebugEl.textContent = formatJson(state.lastTurnDebug, "Turn debug will appear here after the first request.");
}

function renderPreflightPanel(): void {
  const preflight = getRuntimePreflight();
  const issues = Array.isArray(preflight?.issues) ? preflight.issues : [];
  const counts = preflight?.counts || {};
  const hasIssues = issues.length > 0;
  if (!preflight || (!hasIssues && preflight.status !== "checking")) {
    preflightPanelEl.hidden = true;
    preflightSummaryEl.textContent = "";
    preflightIssuesEl.innerHTML = "";
    preflightAdvancedEl.hidden = true;
    preflightAdvancedJsonEl.textContent = "";
    return;
  }

  preflightPanelEl.hidden = false;
  if (preflight.status === "checking") {
    preflightTitleEl.textContent = "Checking setup";
  } else if ((counts.blocker || 0) > 0) {
    preflightTitleEl.textContent = "Setup required";
  } else if ((counts.warning || 0) > 0) {
    preflightTitleEl.textContent = "Setup warnings";
  } else {
    preflightTitleEl.textContent = "Setup notes";
  }
  preflightSummaryEl.textContent = preflight.summary || "The app needs setup changes before the first turn.";
  preflightIssuesEl.innerHTML = "";

  issues.forEach((issue) => {
    const item = document.createElement("li");
    item.className = "preflight-issue";

    const header = document.createElement("div");
    header.className = "preflight-issue-header";

    const badge = document.createElement("span");
    badge.className = "preflight-badge";
    badge.dataset.severity = issue.severity || "info";
    badge.textContent = issue.severity || "info";
    header.appendChild(badge);

    if (issue.title) {
      const title = document.createElement("strong");
      title.textContent = issue.title;
      header.appendChild(title);
    }

    item.appendChild(header);

    if (issue.message) {
      const message = document.createElement("p");
      message.className = "preflight-issue-copy";
      message.textContent = issue.message;
      item.appendChild(message);
    }

    const recommendedFix = issue.recommended_fix || issue.recovery?.[0];
    if (recommendedFix) {
      const fix = document.createElement("p");
      fix.className = "preflight-issue-fix";
      fix.textContent = `Recommended next step: ${recommendedFix}`;
      item.appendChild(fix);
    }

    if (issue.details && Object.keys(issue.details).length > 0) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Advanced details";
      const pre = document.createElement("pre");
      pre.textContent = formatJson(issue.details, "No advanced details.");
      details.appendChild(summary);
      details.appendChild(pre);
      item.appendChild(details);
    }

    preflightIssuesEl.appendChild(item);
  });

  const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
  const advancedSnapshot = runtime && typeof runtime === "object"
    ? {
        preflight: {
          status: preflight.status || null,
          counts: preflight.counts || null,
          checked_at: (runtime as { preflight?: { checked_at?: unknown } }).preflight?.checked_at || null
        },
        config_diagnostics: (runtime as { config_diagnostics?: unknown }).config_diagnostics || null
      }
    : null;

  if (advancedSnapshot) {
    preflightAdvancedEl.hidden = false;
    preflightAdvancedJsonEl.textContent = formatJson(advancedSnapshot, "No advanced setup details.");
  } else {
    preflightAdvancedEl.hidden = true;
    preflightAdvancedJsonEl.textContent = "";
  }
}

function renderSessionSummary(): void {
  const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
  const session = state.sessionDebug?.session || state.lastTurnDebug?.session;
  const preflight = getRuntimePreflight();
  const beat = state.player?.director_state?.current_beat_label;

  const runtimeParts: string[] = [];
  if (runtime && typeof runtime.provider === "string") runtimeParts.push(runtime.provider);
  if (runtime && typeof runtime.chat_model === "string") runtimeParts.push(runtime.chat_model);
  if (hasBlockingPreflight(preflight)) runtimeParts.push("setup required");
  if ((preflight?.counts?.warning || 0) > 0 && !hasBlockingPreflight(preflight)) runtimeParts.push("warnings");
  if (preflight?.status === "checking") runtimeParts.push("checking AI");
  if (session && typeof session.player_id === "string") runtimeParts.push(`player ${session.player_id.slice(0, 8)}`);
  runtimeSummaryEl.textContent = runtimeParts.length ? runtimeParts.join(" / ") : "Waiting for session...";

  if (!state.player) {
    sessionSummaryEl.textContent = "No active session yet.";
    return;
  }

  const details = [`${state.player.name} in ${state.player.location}`];
  if (beat) details.push(`beat: ${beat}`);
  sessionSummaryEl.textContent = details.join(" | ");
}

function updateSessionData(data: StateApiResponse): void {
  if (!data.player) return;

  state.player = data.player;
  state.playerId = data.player.id;
  state.sessionDebug = data.debug || state.sessionDebug;

  localStorage.setItem("playerId", state.playerId);
  if (!nameEl.value.trim()) {
    nameEl.value = data.player.name;
  }
  rememberPlayerName();
  renderSessionSummary();
  renderPreflightPanel();
  renderDebugPanels();
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

async function ensurePlayer({ force = false, showStatus = false, announce = false } = {}): Promise<PlayerState> {
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

  if (!state.player) {
    throw new Error("Player initialization failed.");
  }

  if (announce) {
    addEntry("System", `${state.player.name} is ready in ${state.player.location}.`);
  }

  if (showStatus) {
    const preflight = getRuntimePreflight();
    if (hasBlockingPreflight(preflight)) {
      setStatus("Setup required", "error");
    } else if (preflight?.status === "checking") {
      setStatus("Checking AI setup", "working");
    } else if ((preflight?.counts?.warning || 0) > 0) {
      setStatus("Ready with warnings", "working");
    } else {
      setStatus("Session ready", "ok");
    }
  }
  return state.player;
}

async function requestAssist(): Promise<void> {
  if (state.pending) return;

  const input = inputEl.value.trim();
  if (!input) {
    setAssist([], []);
    return;
  }

  try {
    await ensurePlayer();
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
  const setupBlocked = hasBlockingPreflight(preflight);
  sendButtonEl.disabled = pending || setupBlocked;
  inputEl.disabled = pending || setupBlocked;
  refreshSessionButtonEl.disabled = pending;
  newSessionButtonEl.disabled = pending;

  Array.from(optionsEl.querySelectorAll("button")).forEach((button) => {
    button.disabled = pending || setupBlocked;
  });
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.pending) return;

  const input = inputEl.value.trim();
  if (!input) return;

  setPending(true);
  setStatus("Sending turn", "working");

  try {
    await ensurePlayer();
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
    inputEl.focus();
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

refreshSessionButtonEl.addEventListener("click", async () => {
  try {
    setStatus("Refreshing state", "working");
    await ensurePlayer({ force: true });
    addEntry("System", "Session state refreshed.", "system");
    const preflight = getRuntimePreflight();
    if (hasBlockingPreflight(preflight)) {
      setStatus("Setup required", "error");
    } else if (preflight?.status === "checking") {
      setStatus("Checking AI setup", "working");
    } else if ((preflight?.counts?.warning || 0) > 0) {
      setStatus("Ready with warnings", "working");
    } else {
      setStatus("Session ready", "ok");
    }
  } catch (error) {
    addEntry("System", error instanceof Error ? error.message : "Refresh failed.", "system");
    setStatus("Refresh failed", "error");
  }
});

newSessionButtonEl.addEventListener("click", async () => {
  localStorage.removeItem("playerId");
  state.playerId = "";
  state.player = null;
  state.sessionDebug = null;
  state.lastTurnDebug = null;
  logEl.innerHTML = "";
  setOptions([]);
  setAssist([], []);
  renderSessionSummary();
  renderPreflightPanel();
  renderDebugPanels();

  try {
    await ensurePlayer({ force: true, showStatus: true, announce: true });
  } catch (error) {
    addEntry("System", error instanceof Error ? error.message : "Failed to create a new session.", "system");
    setStatus("Session failed", "error");
  }
});

async function bootstrap(): Promise<void> {
  setAssist([], []);

  try {
    await ensurePlayer({ force: true, showStatus: true, announce: true });
  } catch (error) {
    addEntry("System", error instanceof Error ? error.message : "Failed to initialize session.", "system");
    setStatus("Session failed", "error");
  }

  inputEl.focus();
}

bootstrap().catch(() => {
  setStatus("Session failed", "error");
});
