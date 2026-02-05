import crypto from "crypto";
import { getDb } from "./db.js";
import { getInitialDirectorState, loadDirectorSpec } from "./director.js";

import { getInitialDirectorState, loadDirectorSpec } from "./director.js";

export function getOrCreatePlayer({ playerId, name }) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM players WHERE id = ?")
    .get(playerId);

  if (existing) return hydratePlayer(existing);

  const id = playerId || crypto.randomUUID();
  const now = new Date().toISOString();
  const directorSpec = loadDirectorSpec();
  const newPlayer = {
    id,
    name: name || "Wanderer",
    created_at: now,
    location: "Rooftop Market",
    summary: "",
    director_state: JSON.stringify(getInitialDirectorState(directorSpec)),
    inventory: JSON.stringify([]),
    flags: JSON.stringify([]),
    quests: JSON.stringify([])
  };

  db.prepare(
    `INSERT INTO players (id, name, created_at, location, summary, director_state, inventory, flags, quests)
     VALUES (@id, @name, @created_at, @location, @summary, @director_state, @inventory, @flags, @quests)`
  ).run(newPlayer);

  return hydratePlayer(newPlayer);
}

export function getShortHistory(playerId, limit = 6) {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT role, content FROM events WHERE player_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(playerId, limit)
    .reverse();

  return rows.map((row) => `${row.role.toUpperCase()}: ${row.content}`);
}

export function getRecentMemories(playerId, limit = 6) {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT content FROM memories WHERE player_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(playerId, limit)
    .reverse();

  return rows.map((row) => row.content);
}

export function getRecentText(playerId, limit = 120) {
  const db = getDb();
  const eventRows = db
    .prepare(
      "SELECT content FROM events WHERE player_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(playerId, limit);
  const memoryRows = db
    .prepare(
      "SELECT content FROM memories WHERE player_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(playerId, Math.floor(limit / 2));

  return [...eventRows, ...memoryRows].map((row) => row.content);
}

export function addEvent(playerId, role, content) {
  const db = getDb();
  db.prepare(
    "INSERT INTO events (id, player_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), playerId, role, content, new Date().toISOString());
}

export function addMemories(playerId, memoryList) {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO memories (id, player_id, kind, content, created_at, embedding) VALUES (?, ?, ?, ?, ?, ?)"
  );

  memoryList.forEach(({ content, embedding }) => {
    stmt.run(
      crypto.randomUUID(),
      playerId,
      "fact",
      content,
      now,
      embedding ? JSON.stringify(embedding) : null
    );
  });
}

export function getRelevantMemories(playerId, queryEmbedding, limit = 6) {
  const db = getDb();
  if (!queryEmbedding || !queryEmbedding.length) {
    return getRecentMemories(playerId, limit);
  }

  const rows = db
    .prepare(
      "SELECT content, embedding FROM memories WHERE player_id = ? AND embedding IS NOT NULL"
    )
    .all(playerId);

  if (!rows.length) return getRecentMemories(playerId, limit);

  const scored = rows
    .map((row) => {
      const embedding = safeParseEmbedding(row.embedding);
      if (!embedding.length) return null;
      return {
        content: row.content,
        score: cosineSimilarity(queryEmbedding, embedding)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) return getRecentMemories(playerId, limit);
  return scored.map((item) => item.content);
}

export function updatePlayerState(playerId, updates) {
  const db = getDb();
  const player = db
    .prepare("SELECT * FROM players WHERE id = ?")
    .get(playerId);

  if (!player) return null;

  const inventory = mergeList(JSON.parse(player.inventory), updates.inventory_add, updates.inventory_remove);
  const flags = mergeList(JSON.parse(player.flags), updates.flags_add, updates.flags_remove);
  const quests = mergeQuests(JSON.parse(player.quests), updates.quests);

  db.prepare(
    `UPDATE players
     SET location = ?, inventory = ?, flags = ?, quests = ?
     WHERE id = ?`
  ).run(
    updates.location || player.location,
    JSON.stringify(inventory),
    JSON.stringify(flags),
    JSON.stringify(quests),
    playerId
  );

  return hydratePlayer({ ...player, inventory: JSON.stringify(inventory), flags: JSON.stringify(flags), quests: JSON.stringify(quests) });
}

export function updateDirectorState(playerId, directorState) {
  const db = getDb();
  const player = db
    .prepare("SELECT * FROM players WHERE id = ?")
    .get(playerId);

  if (!player) return null;

  const updated = { ...directorState };
  updated.story_beats_remaining = Math.max(0, updated.story_beats_remaining || 0);

  db.prepare("UPDATE players SET director_state = ? WHERE id = ?").run(
    JSON.stringify(updated),
    playerId
  );

  return updated;
}

export function updateSummary(playerId, memoryUpdates) {
  const db = getDb();
  const player = db
    .prepare("SELECT * FROM players WHERE id = ?")
    .get(playerId);

  if (!player) return null;

  const existing = player.summary ? player.summary.split("\n") : [];
  const next = [...existing, ...memoryUpdates].slice(-30);
  const summary = next.join("\n");

  db.prepare("UPDATE players SET summary = ? WHERE id = ?").run(summary, playerId);
  return summary;
}

function mergeList(existing, addList = [], removeList = []) {
  const set = new Set(existing);
  addList.forEach((item) => set.add(item));
  removeList.forEach((item) => set.delete(item));
  return Array.from(set);
}

function mergeQuests(existing, updates = []) {
  const byId = new Map(existing.map((q) => [q.id, q]));
  updates.forEach((q) => {
    byId.set(q.id, q);
  });
  return Array.from(byId.values());
}

function hydratePlayer(player) {
  return {
    ...player,
    director_state: JSON.parse(player.director_state),
    inventory: JSON.parse(player.inventory),
    flags: JSON.parse(player.flags),
    quests: JSON.parse(player.quests)
  };
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < length; i += 1) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function safeParseEmbedding(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
