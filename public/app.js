const logEl = document.getElementById("log");
const formEl = document.getElementById("input-form");
const nameEl = document.getElementById("player-name");
const inputEl = document.getElementById("player-input");
const sendButtonEl = document.getElementById("send-button");
const optionsEl = document.getElementById("options");
const assistEl = document.getElementById("assist");
const statusPillEl = document.getElementById("status-pill");
const runtimeSummaryEl = document.getElementById("runtime-summary");
const sessionSummaryEl = document.getElementById("session-summary");
const connectionDebugEl = document.getElementById("connection-debug");
const stateDebugEl = document.getElementById("state-debug");
const turnDebugEl = document.getElementById("turn-debug");
const refreshSessionButtonEl = document.getElementById("refresh-session");
const newSessionButtonEl = document.getElementById("new-session");

const state = {
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

function addEntry(label, text, tone = "neutral") {
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

function setStatus(text, tone = "idle") {
  statusPillEl.textContent = text;
  statusPillEl.dataset.tone = tone;
}

function setOptions(options = []) {
  optionsEl.innerHTML = "";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.disabled = state.pending;
    button.addEventListener("click", () => {
      inputEl.value = option;
      inputEl.focus();
      requestAssist();
    });
    optionsEl.appendChild(button);
  });
}

function setAssist(corrections = [], completions = []) {
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
        requestAssist();
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
        requestAssist();
      });
      assistEl.appendChild(chip);
    });
  }
}

function rememberPlayerName() {
  const name = nameEl.value.trim();
  if (name) {
    localStorage.setItem("playerName", name);
  } else {
    localStorage.removeItem("playerName");
  }
}

function replaceToken(token, replacement) {
  const safeToken = escapeRegExp(token);
  const regex = new RegExp(`\\b${safeToken}\\b`);
  inputEl.value = inputEl.value.replace(regex, replacement);
  inputEl.focus();
}

function applyCompletion(completion) {
  inputEl.value = inputEl.value.replace(/[A-Za-z']+$/, completion);
  inputEl.focus();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatJson(value, fallbackMessage) {
  if (value === null || value === undefined) {
    return JSON.stringify({ message: fallbackMessage }, null, 2);
  }

  return JSON.stringify(value, null, 2);
}

function renderDebugPanels() {
  const connectionSnapshot = {
    runtime: state.sessionDebug?.runtime || state.lastTurnDebug?.runtime || null,
    session: state.sessionDebug?.session || state.lastTurnDebug?.session || null,
    last_request_id: state.lastTurnDebug?.request_id || null
  };

  connectionDebugEl.textContent = formatJson(connectionSnapshot, "Session data will appear here.");
  stateDebugEl.textContent = formatJson(state.player, "Player state will appear here.");
  turnDebugEl.textContent = formatJson(state.lastTurnDebug, "Turn debug will appear here after the first request.");
}

function renderSessionSummary() {
  const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
  const session = state.sessionDebug?.session || state.lastTurnDebug?.session;
  const beat = state.player?.director_state?.current_beat_label;

  const runtimeParts = [];
  if (runtime?.provider) runtimeParts.push(runtime.provider);
  if (runtime?.chat_model) runtimeParts.push(runtime.chat_model);
  if (session?.player_id) runtimeParts.push(`player ${session.player_id.slice(0, 8)}`);
  runtimeSummaryEl.textContent = runtimeParts.length ? runtimeParts.join(" / ") : "Waiting for session...";

  if (!state.player) {
    sessionSummaryEl.textContent = "No active session yet.";
    return;
  }

  const details = [`${state.player.name} in ${state.player.location}`];
  if (beat) details.push(`beat: ${beat}`);
  sessionSummaryEl.textContent = details.join(" | ");
}

function updateSessionData(data) {
  if (!data?.player) return;

  state.player = data.player;
  state.playerId = data.player.id;
  state.sessionDebug = data.debug || state.sessionDebug;

  localStorage.setItem("playerId", state.playerId);
  if (!nameEl.value.trim()) {
    nameEl.value = data.player.name;
  }
  rememberPlayerName();
  renderSessionSummary();
  renderDebugPanels();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  let data = {};

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
    data,
    requestId: response.headers.get("x-request-id")
  };
}

function formatErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (Array.isArray(data.detail)) return data.detail.join(", ");
  return data.detail || data.error || fallback;
}

async function ensurePlayer({ force = false, showStatus = false, announce = false } = {}) {
  if (!force && state.playerId && state.player) {
    rememberPlayerName();
    return state.player;
  }

  if (showStatus) setStatus("Loading session", "working");

  rememberPlayerName();
  const params = new URLSearchParams();
  if (state.playerId) params.set("playerId", state.playerId);
  if (nameEl.value.trim()) params.set("name", nameEl.value.trim());

  const result = await fetchJson(`/api/state?${params.toString()}`);
  if (!result.ok) {
    const message = formatErrorMessage(result.data, `State request failed (${result.status})`);
    throw new Error(message);
  }

  updateSessionData(result.data);

  if (announce) {
    addEntry("System", `${state.player.name} is ready in ${state.player.location}.`);
  }

  if (showStatus) setStatus("Session ready", "ok");
  return state.player;
}

async function requestAssist() {
  if (state.pending) return;

  const input = inputEl.value.trim();
  if (!input) {
    setAssist([], []);
    return;
  }

  try {
    await ensurePlayer();
    const result = await fetchJson("/api/assist", {
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

function setPending(pending) {
  state.pending = pending;
  sendButtonEl.disabled = pending;
  refreshSessionButtonEl.disabled = pending;
  newSessionButtonEl.disabled = pending;

  Array.from(optionsEl.querySelectorAll("button")).forEach((button) => {
    button.disabled = pending;
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

    const result = await fetchJson("/api/turn", {
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
    renderDebugPanels();

    if (!result.ok) {
      const message = formatErrorMessage(result.data, `Turn request failed (${result.status})`);
      addEntry("System", message, "system");
      setStatus("Turn failed", "error");
      return;
    }

    addEntry("Narrator", result.data.narrative || "No narrative returned.", "narrator");
    setOptions(result.data.player_options || []);
    const latency = result.data.debug?.turn?.latency_ms;
    setStatus(
      typeof latency === "number" ? `Turn complete in ${latency} ms` : "Turn complete",
      "ok"
    );
  } catch (error) {
    addEntry("System", error.message || "Request failed.", "system");
    setStatus("Request failed", "error");
  } finally {
    setPending(false);
    inputEl.focus();
  }
});

inputEl.addEventListener("input", () => {
  clearTimeout(state.assistTimer);
  state.assistTimer = setTimeout(requestAssist, 250);
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
    setStatus("Session ready", "ok");
  } catch (error) {
    addEntry("System", error.message || "Refresh failed.", "system");
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
  renderDebugPanels();

  try {
    await ensurePlayer({ force: true, showStatus: true, announce: true });
  } catch (error) {
    addEntry("System", error.message || "Failed to create a new session.", "system");
    setStatus("Session failed", "error");
  }
});

async function bootstrap() {
  setAssist([], []);

  try {
    await ensurePlayer({ force: true, showStatus: true, announce: true });
  } catch (error) {
    addEntry("System", error.message || "Failed to initialize session.", "system");
    setStatus("Session failed", "error");
  }

  inputEl.focus();
}

bootstrap();
