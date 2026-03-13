import crypto from "node:crypto";
import { getDb } from "../core/db.js";
import { getInitialDirectorState, loadDirectorSpec } from "../story/director.js";
import { loadQuestSpec, resolveQuestUpdates } from "../story/quest.js";
import { AUTHORITATIVE_STATE_SCHEMA_VERSION } from "../core/types.js";
import { validateMemorySummaryArtifact } from "../rules/validator.js";
import type {
  CanonicalEventPayload,
  CommittedEventRow,
  DirectorState,
  EventRow,
  MemorySummaryArtifact,
  MemoryInsert,
  NpcEncounterFact,
  NpcMemoryRecord,
  MemoryRow,
  Player,
  PlayerRow,
  QuestUpdate
} from "../core/types.js";
import { createPlayerCreatedEventPayload } from "./committed-event.js";
import { reduceCommittedPlayerState } from "./reducer.js";

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
  const questSpec = loadQuestSpec();
  const initialQuests = resolveQuestUpdates({
    questSpec,
    existingQuests: [],
    flags: []
  });
  const newPlayer: PlayerRow = {
    id,
    name: name || "Wanderer",
    created_at: now,
    location: "Rooftop Market",
    summary: "",
    director_state: JSON.stringify(getInitialDirectorState(directorSpec)),
    inventory: JSON.stringify([]),
    flags: JSON.stringify([]),
    quests: JSON.stringify(initialQuests)
  };

  db.prepare(
    `INSERT INTO players (id, name, created_at, location, summary, director_state, inventory, flags, quests)
     VALUES (@id, @name, @created_at, @location, @summary, @director_state, @inventory, @flags, @quests)`
  ).run(newPlayer);

  const hydrated = hydratePlayer(newPlayer);
  addCommittedTurnEvent(
    createPlayerCreatedEventPayload({
      occurredAt: now,
      player: {
        schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
        ...hydrated
      },
      supplemental: {
        presentation: {
          narrative: null,
          player_options: []
        }
      }
    })
  );

  return hydrated;
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
    .prepare("SELECT content FROM memories WHERE player_id = ? AND kind NOT IN ('npc-encounter-fact', 'npc-memory', 'memory-summary-artifact') ORDER BY created_at DESC LIMIT ?")
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

export function addCommittedTurnEvent(payload: CanonicalEventPayload): void {
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

export function getCommittedTurnEvents(playerId: string): CanonicalEventPayload[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, player_id, schema_version, event_kind, payload, created_at FROM committed_events WHERE player_id = ? ORDER BY created_at ASC")
    .all(playerId) as CommittedEventRow[];

  return rows
    .map((row) => safeJsonParse<CanonicalEventPayload | null>(row.payload, null))
    .filter((row): row is CanonicalEventPayload => row !== null);
}

export function addMemories(playerId: string, memoryList: MemoryInsert[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO memories (id, player_id, kind, content, created_at, embedding) VALUES (?, ?, ?, ?, ?, ?)"
  );

  memoryList.forEach(({ content, kind = "fact", embedding }) => {
    stmt.run(
      crypto.randomUUID(),
      playerId,
      kind,
      content,
      now,
      embedding ? JSON.stringify(embedding) : null
    );
  });
}

export function getNpcEncounterFacts(playerId: string, npcId?: string, limit = 12): NpcEncounterFact[] {
  const db = getDb();
  const rows = (npcId
    ? db
        .prepare(
          "SELECT content FROM memories WHERE player_id = ? AND kind = 'npc-encounter-fact' AND content LIKE ? ORDER BY created_at DESC LIMIT ?"
        )
        .all(playerId, `%\"npc_id\":\"${npcId}\"%`, limit)
    : db
        .prepare("SELECT content FROM memories WHERE player_id = ? AND kind = 'npc-encounter-fact' ORDER BY created_at DESC LIMIT ?")
        .all(playerId, limit)) as ContentRow[];

  return rows
    .map((row) => safeJsonParse<NpcEncounterFact | null>(row.content, null))
    .filter((row): row is NpcEncounterFact => row !== null);
}

export function getNpcMemoryRecords(playerId: string, npcId?: string, limit = 12): NpcMemoryRecord[] {
  const db = getDb();
  const rows = (npcId
    ? db
        .prepare(
          "SELECT content FROM memories WHERE player_id = ? AND kind = 'npc-memory' AND content LIKE ? ORDER BY created_at DESC LIMIT ?"
        )
        .all(playerId, `%\"npc_id\":\"${npcId}\"%`, limit)
    : db
        .prepare("SELECT content FROM memories WHERE player_id = ? AND kind = 'npc-memory' ORDER BY created_at DESC LIMIT ?")
        .all(playerId, limit)) as ContentRow[];

  return rows
    .map((row) => safeJsonParse<NpcMemoryRecord | null>(row.content, null))
    .filter((row): row is NpcMemoryRecord => row !== null);
}

export function getMemorySummaryArtifacts(
  playerId: string,
  options: {
    artifactKind?: MemorySummaryArtifact["artifact_kind"];
    beatId?: string;
    limit?: number;
  } = {}
): MemorySummaryArtifact[] {
  const db = getDb();
  const { artifactKind, beatId, limit = 12 } = options;
  const rows = db
    .prepare("SELECT content FROM memories WHERE player_id = ? AND kind = 'memory-summary-artifact' ORDER BY created_at DESC LIMIT ?")
    .all(playerId, limit * 4) as ContentRow[];

  return rows
    .map((row) => safeJsonParse<MemorySummaryArtifact | null>(row.content, null))
    .filter((row): row is MemorySummaryArtifact => row !== null)
    .filter((row) => validateMemorySummaryArtifact(row).ok)
    .filter((row) => (artifactKind ? row.artifact_kind === artifactKind : true))
    .filter((row) => (beatId ? row.beat_id === beatId : true))
    .slice(0, limit);
}

export function getRelevantMemories(playerId: string, queryEmbedding: number[], limit = 6): string[] {
  const db = getDb();
  if (!queryEmbedding.length) {
    return getRecentMemories(playerId, limit);
  }

  const rows = db
    .prepare("SELECT content, embedding FROM memories WHERE player_id = ? AND kind NOT IN ('npc-encounter-fact', 'npc-memory', 'memory-summary-artifact') AND embedding IS NOT NULL")
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

  const reduced = reduceCommittedPlayerState({
    player: hydratePlayer(player),
    acceptedConsequences: {
      state_updates: updates,
      director_updates: null,
      memory_updates: []
    }
  });

  return persistPlayerState(reduced.player);
}

export function persistPlayerState(player: Player): Player | null {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM players WHERE id = ?").get(player.id) as { id: string } | undefined;

  if (!existing) return null;

  db.prepare(
    `UPDATE players
     SET location = ?, summary = ?, director_state = ?, inventory = ?, flags = ?, quests = ?
     WHERE id = ?`
  ).run(
    player.location,
    player.summary,
    JSON.stringify(player.director_state),
    JSON.stringify(player.inventory),
    JSON.stringify(player.flags),
    JSON.stringify(player.quests),
    player.id
  );

  return {
    ...player,
    inventory: [...player.inventory],
    flags: [...player.flags],
    quests: player.quests.map((quest) => ({ ...quest })),
    director_state: {
      ...player.director_state,
      completed_beats: [...player.director_state.completed_beats]
    }
  };
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
