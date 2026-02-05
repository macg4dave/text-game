import "dotenv/config";
import express from "express";
import { initDb } from "./db.js";
import {
  getOrCreatePlayer,
  getShortHistory,
  getRecentText,
  getRelevantMemories,
  addEvent,
  addMemories,
  updatePlayerState,
  updateDirectorState,
  updateSummary
} from "./game.js";
import { assistText } from "./assist.js";
import {
  applyDirectorRules,
  getCurrentBeat,
  getInitialDirectorState,
  loadDirectorSpec,
  reloadDirectorSpec
} from "./director.js";
import { validateDirectorSpec, validateQuestSpec, validateStateUpdates } from "./validator.js";
import { loadQuestSpec, reloadQuestSpec } from "./quest.js";
import { generateTurn, getEmbedding, getEmbeddings } from "./ai.js";

const app = express();
const port = process.env.PORT || 3000;
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
let directorSpec = loadDirectorSpec();
let questSpec = loadQuestSpec();

initDb();

app.use(express.json());
app.use(express.static("public"));

const SYSTEM_PROMPT = `You are the Narrative Engine for a text-based adventure game.
- The player can attempt anything; never refuse. Adapt consequences instead.
- You must respect STATE_PACK facts, quest status, and director state.
- You are a director: guide toward the end goal in STATE_PACK.director.end_goal.
- Never change the end goal. Only update end_goal_progress.
- Use STATE_PACK.director_spec.current_beat to steer the scene.
- When a beat is achieved, add the beat's unlock flag via state_updates.flags_add.
- Keep outputs concise and vivid.
- Provide structured JSON only (no extra text).`;

app.get("/api/state", (req, res) => {
  const playerId = req.query.playerId || undefined;
  const name = req.query.name || undefined;
  const player = getOrCreatePlayer({ playerId, name });
  const normalized = normalizeDirectorState(player);
  if (normalized.changed) {
    updateDirectorState(player.id, normalized.director);
    player.director_state = normalized.director;
  }
  res.json({ player });
});

app.post("/api/assist", (req, res) => {
  const { playerId, name, input } = req.body || {};
  if (!input || typeof input !== "string") {
    return res.status(400).json({ error: "Missing input" });
  }

  const player = getOrCreatePlayer({ playerId, name });
  const dynamicTexts = getRecentText(player.id, 120);
  const result = assistText({ text: input, dynamicTexts });

  return res.json(result);
});

app.get("/api/director/spec", (req, res) => {
  res.json({ spec: directorSpec });
});

app.get("/api/quests/spec", (req, res) => {
  res.json({ spec: questSpec });
});

app.post("/api/director/reload", (req, res) => {
  try {
    directorSpec = reloadDirectorSpec();
    const validation = validateDirectorSpec(directorSpec);
    if (!validation.ok) {
      return res.status(400).json({ error: "Invalid director spec", detail: validation.errors });
    }
    return res.json({ ok: true, spec: directorSpec });
  } catch (err) {
    return res.status(500).json({ error: "Failed to reload spec", detail: err.message });
  }
});

app.post("/api/quests/reload", (req, res) => {
  try {
    questSpec = reloadQuestSpec();
    const validation = validateQuestSpec(questSpec);
    if (!validation.ok) {
      return res.status(400).json({ error: "Invalid quest spec", detail: validation.errors });
    }
    return res.json({ ok: true, spec: questSpec });
  } catch (err) {
    return res.status(500).json({ error: "Failed to reload quest spec", detail: err.message });
  }
});

app.post("/api/turn", async (req, res) => {
  try {
    const { playerId, name, input } = req.body || {};
    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "Missing input" });
    }

    const player = getOrCreatePlayer({ playerId, name });
    const normalized = normalizeDirectorState(player);
    if (normalized.changed) {
      updateDirectorState(player.id, normalized.director);
      player.director_state = normalized.director;
    }

    addEvent(player.id, "player", input);

    const shortHistory = getShortHistory(player.id, 6);
    let inputEmbedding = [];
    try {
      inputEmbedding = await getEmbedding({ model: embeddingModel, input });
    } catch (err) {
      inputEmbedding = [];
    }
    const memories = getRelevantMemories(player.id, inputEmbedding, 6);

    const statePack = {
      player: {
        id: player.id,
        name: player.name,
        location: player.location,
        inventory: player.inventory,
        flags: player.flags,
        quests: player.quests
      },
      summary: player.summary,
      director: player.director_state,
      director_spec: {
        end_goal: directorSpec.end_goal,
        current_beat: getCurrentBeat(directorSpec, player.director_state),
        rules: directorSpec.rules
      },
      quest_spec: questSpec
    };

    const rawResult = await generateTurn({
      model,
      systemPrompt: SYSTEM_PROMPT,
      statePack,
      shortHistory,
      memories,
      input
    });

    const result = sanitizeTurnResult(rawResult, player);
    const updateValidation = validateStateUpdates(result.state_updates);
    if (!updateValidation.ok) {
      return res.status(400).json({ error: "Invalid state updates", detail: updateValidation.errors });
    }

    addEvent(player.id, "narrator", result.narrative);

    updatePlayerState(player.id, result.state_updates);
    const nextFlags = mergeList(
      player.flags,
      result.state_updates.flags_add,
      result.state_updates.flags_remove
    );
    const directorState = applyDirectorRules({
      spec: directorSpec,
      directorState: player.director_state,
      stateUpdates: result.state_updates,
      flags: nextFlags
    });
    directorState.end_goal_progress = result.director_updates.end_goal_progress;
    updateDirectorState(player.id, directorState);
    if (result.memory_updates?.length) {
      let embeddings = [];
      try {
        embeddings = await getEmbeddings({
          model: embeddingModel,
          inputs: result.memory_updates
        });
      } catch (err) {
        embeddings = [];
      }

      const memoryItems = result.memory_updates.map((content, index) => ({
        content,
        embedding: embeddings[index]
      }));
      addMemories(player.id, memoryItems);
      updateSummary(player.id, result.memory_updates);
    }

    res.json({
      narrative: result.narrative,
      player_options: result.player_options,
      state_updates: result.state_updates,
      director_updates: result.director_updates
    });
  } catch (err) {
    res.status(500).json({ error: "Turn failed", detail: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

function sanitizeTurnResult(result, player) {
  const safe = {
    narrative: typeof result?.narrative === "string" ? result.narrative : "The world holds its breath.",
    player_options: ensureStringArray(result?.player_options, 6),
    state_updates: {
      location: ensureString(result?.state_updates?.location, player.location),
      inventory_add: ensureStringArray(result?.state_updates?.inventory_add),
      inventory_remove: ensureStringArray(result?.state_updates?.inventory_remove),
      flags_add: ensureStringArray(result?.state_updates?.flags_add),
      flags_remove: ensureStringArray(result?.state_updates?.flags_remove),
      quests: ensureQuestArray(result?.state_updates?.quests)
    },
    director_updates: {
      end_goal_progress: ensureString(result?.director_updates?.end_goal_progress, player.director_state.end_goal_progress)
    },
    memory_updates: ensureStringArray(result?.memory_updates, 8)
  };

  return safe;
}

function ensureString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function ensureNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function ensureStringArray(value, max = 20) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string").slice(0, max);
}

function ensureQuestArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      status: typeof item.status === "string" ? item.status : "unknown",
      summary: typeof item.summary === "string" ? item.summary : ""
    }));
}

function mergeList(existing, addList = [], removeList = []) {
  const set = new Set(existing);
  addList.forEach((item) => set.add(item));
  removeList.forEach((item) => set.delete(item));
  return Array.from(set);
}

function normalizeDirectorState(player) {
  const director = player.director_state || getInitialDirectorState(directorSpec);
  const missingFields = !director.current_act_id || !director.current_beat_id || !director.current_beat_label;
  if (!missingFields) return { director, changed: false };

  const initial = getInitialDirectorState(directorSpec);
  const fallback = { ...initial, end_goal_progress: director.end_goal_progress || initial.end_goal_progress };
  if (director.current_act && director.current_act_id === undefined) {
    // Attempt to map legacy act names
    const act = directorSpec.acts.find((item) => item.name === director.current_act);
    if (act) {
      fallback.current_act_id = act.id;
      fallback.current_act = act.name;
      fallback.current_beat_id = act.beats[0]?.id || fallback.current_beat_id;
      fallback.current_beat_label = act.beats[0]?.label || fallback.current_beat_label;
    }
  }

  return { director: fallback, changed: true };
}
