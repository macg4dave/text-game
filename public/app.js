const logEl = document.getElementById("log");
const formEl = document.getElementById("input-form");
const nameEl = document.getElementById("player-name");
const inputEl = document.getElementById("player-input");
const optionsEl = document.getElementById("options");
const assistEl = document.getElementById("assist");

let playerId = localStorage.getItem("playerId");
let assistTimer = null;

function addEntry(label, text) {
  const entry = document.createElement("div");
  entry.className = "entry";
  entry.innerHTML = `<strong>${label}</strong><div>${text}</div>`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function setOptions(options = []) {
  optionsEl.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = opt;
    btn.addEventListener("click", () => {
      inputEl.value = opt;
      inputEl.focus();
    });
    optionsEl.appendChild(btn);
  });
}

function setAssist(corrections = [], completions = []) {
  assistEl.innerHTML = "";
  if (!corrections.length && !completions.length) return;

  if (corrections.length) {
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Spelling:";
    assistEl.appendChild(label);

    corrections.forEach((item) => {
      const suggestion = item.suggestions[0];
      if (!suggestion) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = `${item.token} → ${suggestion}`;
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
    label.textContent = "Complete:";
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

async function ensurePlayer() {
  const params = new URLSearchParams();
  if (playerId) params.set("playerId", playerId);
  if (nameEl.value) params.set("name", nameEl.value);

  const res = await fetch(`/api/state?${params.toString()}`);
  const data = await res.json();
  playerId = data.player.id;
  localStorage.setItem("playerId", playerId);
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

async function requestAssist() {
  const input = inputEl.value.trim();
  if (!input) {
    setAssist([], []);
    return;
  }

  await ensurePlayer();

  const res = await fetch("/api/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId,
      name: nameEl.value,
      input
    })
  });

  const data = await res.json();
  if (data.error) return;
  setAssist(data.corrections || [], data.completions || []);
}

inputEl.addEventListener("input", () => {
  clearTimeout(assistTimer);
  assistTimer = setTimeout(requestAssist, 300);
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = inputEl.value.trim();
  if (!input) return;

  await ensurePlayer();

  addEntry("You", input);
  inputEl.value = "";
  setAssist([], []);

  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId,
      name: nameEl.value,
      input
    })
  });

  const data = await res.json();
  if (data.error) {
    addEntry("System", data.error);
    return;
  }

  addEntry("Narrator", data.narrative);
  setOptions(data.player_options || []);
});
