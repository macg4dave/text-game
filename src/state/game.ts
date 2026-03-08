import crypto from "node:crypto";
import { getDb } from "../core/db.js";
import { getInitialDirectorState, loadDirectorSpec } from "../story/director.js";
import type {
  CanonicalTurnEventPayload,
  CommittedEventRow,
  DirectorState,
  EventRow,
  MemoryInsert,
  MemoryRow,
  Player,
  PlayerRow,
  QuestUpdate
} from "../core/types.js";

interface ContentRow {
  content: string;
}

export function getOrCreatePlayer({ playerId, name }: { playerId?: string; name?: string }): Player {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as PlayerRow | undefined;

  if (existing) return hydratePlayer(existing);

  const id = playerId || crypto.randomUUID();
  const now = new Date().toISOString();
  const directorSpec = loadDirectorSpec();
  const newPlayer: PlayerRow = {
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

export function getShortHistory(playerId: string, limit = 6): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT role, content FROM events WHERE player_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(playerId, limit) as EventRow[];

  return rows.reverse().map((row) => `${row.role.toUpperCase()}: ${row.content}`);
}

export function getRecentMemories(playerId: string, limit = 6): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT content FROM memories WHERE player_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(playerId, limit) as ContentRow[];

  return rows.reverse().map((row) => row.content);
}

export function getRecentText(playerId: string, limit = 120): string[] {
  const db = getDb();
  const eventRows = db
    .prepare("SELECT content FROM events WHERE player_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(playerId, limit) as ContentRow[];
  const memoryRows = db
    .prepare("SELECT content FROM memories WHERE player_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(playerId, Math.floor(limit / 2)) as ContentRow[];

  return [...eventRows, ...memoryRows].map((row) => row.content);
}

export function addEvent(playerId: string, role: string, content: string): void {
  const db = getDb();
  db.prepare("INSERT INTO events (id, player_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)").run(
    crypto.randomUUID(),
    playerId,
    role,
    content,
    new Date().toISOString()
  );
}

export function addCommittedTurnEvent(payload: CanonicalTurnEventPayload): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO committed_events (id, player_id, schema_version, event_kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    payload.event_id,
    payload.player_id,
    payload.schema_version,
    payload.event_kind,
    JSON.stringify(payload),
    payload.occurred_at
  );
}

export function getCommittedTurnEvents(playerId: string): CanonicalTurnEventPayload[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, player_id, schema_version, event_kind, payload, created_at FROM committed_events WHERE player_id = ? ORDER BY created_at ASC")
    .all(playerId) as CommittedEventRow[];

  return rows
    .map((row) => safeJsonParse<CanonicalTurnEventPayload | null>(row.payload, null))
    .filter((row): row is CanonicalTurnEventPayload => row !== null);
}

export function addMemories(playerId: string, memoryList: MemoryInsert[]): void {
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

export function getRelevantMemories(playerId: string, queryEmbedding: number[], limit = 6): string[] {
  const db = getDb();
  if (!queryEmbedding.length) {
    return getRecentMemories(playerId, limit);
  }

  const rows = db
    .prepare("SELECT content, embedding FROM memories WHERE player_id = ? AND embedding IS NOT NULL")
    .all(playerId) as MemoryRow[];

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
    .filter((item): item is { content: string; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) return getRecentMemories(playerId, limit);
  return scored.map((item) => item.content);
}

export function updatePlayerState(playerId: string, updates: {
  location: string;
  inventory_add: string[];
  inventory_remove: string[];
  flags_add: string[];
  flags_remove: string[];
  quests: QuestUpdate[];
}): Player | null {
  const db = getDb();
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as PlayerRow | undefined;

  if (!player) return null;

  const inventory = mergeList(safeJsonParse(player.inventory, [] as string[]), updates.inventory_add, updates.inventory_remove);
  const flags = mergeList(safeJsonParse(player.flags, [] as string[]), updates.flags_add, updates.flags_remove);
  const quests = mergeQuests(safeJsonParse(player.quests, [] as QuestUpdate[]), updates.quests);

  db.prepare(
    `UPDATE players
     SET location = ?, inventory = ?, flags = ?, quests = ?
     WHERE id = ?`
  ).run(updates.location || player.location, JSON.stringify(inventory), JSON.stringify(flags), JSON.stringify(quests), playerId);

  return hydratePlayer({
    ...player,
    location: updates.location || player.location,
    inventory: JSON.stringify(inventory),
    flags: JSON.stringify(flags),
    quests: JSON.stringify(quests)
  });
}

export function updateDirectorState(playerId: string, directorState: DirectorState): DirectorState | null {
  const db = getDb();
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as PlayerRow | undefined;

  if (!player) return null;

  const updated: DirectorState = { ...directorState };
  updated.story_beats_remaining = Math.max(0, updated.story_beats_remaining || 0);

  db.prepare("UPDATE players SET director_state = ? WHERE id = ?").run(JSON.stringify(updated), playerId);

  return updated;
}

export function updateSummary(playerId: string, memoryUpdates: string[]): string | null {
  const db = getDb();
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as PlayerRow | undefined;

  if (!player) return null;

  const existing = player.summary ? player.summary.split("\n") : [];
  const next = [...existing, ...memoryUpdates].slice(-30);
  const summary = next.join("\n");

  db.prepare("UPDATE players SET summary = ? WHERE id = ?").run(summary, playerId);
  return summary;
}

function mergeList(existing: string[], addList: string[] = [], removeList: string[] = []): string[] {
  const set = new Set(existing);
  addList.forEach((item) => set.add(item));
  removeList.forEach((item) => set.delete(item));
  return Array.from(set);
}

function mergeQuests(existing: QuestUpdate[], updates: QuestUpdate[] = []): QuestUpdate[] {
  const byId = new Map(existing.map((quest) => [quest.id, quest]));
  updates.forEach((quest) => {
    byId.set(quest.id, quest);
  });
  return Array.from(byId.values());
}

function hydratePlayer(player: PlayerRow): Player {
  return {
    ...player,
    director_state: safeJsonParse(player.director_state, getInitialDirectorState(loadDirectorSpec())),
    inventory: safeJsonParse(player.inventory, [] as string[]),
    flags: safeJsonParse(player.flags, [] as string[]),
    quests: safeJsonParse(player.quests, [] as QuestUpdate[])
  };
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < length; i += 1) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function safeParseEmbedding(raw: string | null): number[] {
  return safeJsonParse(raw, [] as number[]);
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
