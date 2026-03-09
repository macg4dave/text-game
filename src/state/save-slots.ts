import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "../core/db.js";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  SAVE_SLOT_SCHEMA_VERSION,
  type DirectorState,
  type Player,
  type PlayerRow,
  type QuestUpdate,
  type SaveSlotRow,
  type SaveSlotSummary
} from "../core/types.js";

interface EventSnapshotRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface MemorySnapshotRow {
  id: string;
  kind: string;
  content: string;
  created_at: string;
  embedding: string | null;
}

interface CommittedEventSnapshotRow {
  id: string;
  schema_version: string;
  event_kind: string;
  payload: string;
  created_at: string;
}

type SaveSlotErrorCode = "player_not_found" | "slot_not_found" | "slot_corrupted" | "slot_incompatible";

export class SaveSlotError extends Error {
  readonly code: SaveSlotErrorCode;
  readonly statusCode: number;

  constructor(code: SaveSlotErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "SaveSlotError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function listSaveSlots(): SaveSlotSummary[] {
  const database = getDb();
  const rows = database
    .prepare(
      "SELECT id, label, player_id, source_schema_version, created_at, updated_at FROM save_slots ORDER BY updated_at DESC, created_at DESC"
    )
    .all() as SaveSlotRow[];

  return rows.map((row) => buildSaveSlotSummary(database, row));
}

export function savePlayerToSlot(params: {
  playerId: string;
  slotId?: string;
  label?: string;
}): SaveSlotSummary {
  const database = getDb();
  const now = new Date().toISOString();
  const sourcePlayer = readPlayerRow(database, params.playerId);
  if (!sourcePlayer) {
    throw new SaveSlotError("player_not_found", "The current game could not be found, so nothing was saved.", 404);
  }

  validatePlayerSnapshot(sourcePlayer);

  const existingSlot = params.slotId ? readSaveSlotRow(database, params.slotId) : null;
  if (params.slotId && !existingSlot) {
    throw new SaveSlotError("slot_not_found", "That save slot no longer exists. Refresh the list and try again.", 404);
  }

  const nextLabel = normalizeSlotLabel({
    requestedLabel: params.label,
    fallbackLabel: existingSlot?.label ?? null,
    player: sourcePlayer,
    savedAt: now
  });
  const nextSnapshotPlayerId = crypto.randomUUID();
  const slotId = existingSlot?.id ?? crypto.randomUUID();

  database.transaction(() => {
    clonePlayerGraph(database, params.playerId, nextSnapshotPlayerId);

    if (existingSlot) {
      database
        .prepare("UPDATE save_slots SET label = ?, player_id = ?, source_schema_version = ?, updated_at = ? WHERE id = ?")
        .run(nextLabel, nextSnapshotPlayerId, AUTHORITATIVE_STATE_SCHEMA_VERSION, now, existingSlot.id);
      deletePlayerGraph(database, existingSlot.player_id);
      return;
    }

    database
      .prepare(
        `INSERT INTO save_slots (id, label, player_id, source_schema_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(slotId, nextLabel, nextSnapshotPlayerId, AUTHORITATIVE_STATE_SCHEMA_VERSION, now, now);
  })();

  const savedSlot = readSaveSlotRow(database, slotId);
  if (!savedSlot) {
    throw new SaveSlotError("slot_not_found", "The save finished but the slot could not be reloaded. Please try again.", 500);
  }

  return buildSaveSlotSummary(database, savedSlot);
}

export function loadPlayerFromSaveSlot(slotId: string): { slot: SaveSlotSummary; player: Player } {
  const database = getDb();
  const slot = readSaveSlotRow(database, slotId);
  if (!slot) {
    throw new SaveSlotError("slot_not_found", "That save slot could not be found. Refresh the list and try again.", 404);
  }

  const summary = buildSaveSlotSummary(database, slot);
  if (summary.status === "incompatible") {
    throw new SaveSlotError(
      "slot_incompatible",
      summary.detail || "This save was created for a different save format and cannot be loaded here yet.",
      409
    );
  }

  if (summary.status === "corrupted") {
    throw new SaveSlotError(
      "slot_corrupted",
      summary.detail || "This save appears to be damaged and cannot be loaded safely.",
      409
    );
  }

  const livePlayerId = crypto.randomUUID();
  database.transaction(() => {
    clonePlayerGraph(database, slot.player_id, livePlayerId);
  })();

  const livePlayerRow = readPlayerRow(database, livePlayerId);
  if (!livePlayerRow) {
    throw new SaveSlotError("player_not_found", "The save loaded, but the new game session could not be created.", 500);
  }

  return {
    slot: summary,
    player: hydratePlayerStrict(livePlayerRow)
  };
}

function buildSaveSlotSummary(database: Database.Database, slot: SaveSlotRow): SaveSlotSummary {
  const player = readPlayerRow(database, slot.player_id);
  const baseSummary: SaveSlotSummary = {
    schema_version: SAVE_SLOT_SCHEMA_VERSION,
    id: slot.id,
    label: slot.label,
    player_id: slot.player_id,
    player_name: player?.name ?? null,
    location: player?.location ?? null,
    source_schema_version: slot.source_schema_version,
    saved_at: slot.created_at,
    updated_at: slot.updated_at,
    status: "ready",
    detail: null
  };

  if (slot.source_schema_version !== AUTHORITATIVE_STATE_SCHEMA_VERSION) {
    return {
      ...baseSummary,
      status: "incompatible",
      detail: `This save uses ${slot.source_schema_version}, but the current app expects ${AUTHORITATIVE_STATE_SCHEMA_VERSION}.`
    };
  }

  if (!player) {
    return {
      ...baseSummary,
      status: "corrupted",
      detail: "This save is missing its stored session data. Restore a backup or overwrite the slot."
    };
  }

  try {
    validatePlayerSnapshot(player);
  } catch (error) {
    return {
      ...baseSummary,
      status: "corrupted",
      detail: error instanceof Error ? error.message : "This save appears to be damaged."
    };
  }

  return baseSummary;
}

function clonePlayerGraph(database: Database.Database, sourcePlayerId: string, targetPlayerId: string): void {
  const sourcePlayer = readPlayerRow(database, sourcePlayerId);
  if (!sourcePlayer) {
    throw new SaveSlotError("player_not_found", "The source game session could not be found.", 404);
  }

  validatePlayerSnapshot(sourcePlayer);

  const sourceEvents = database
    .prepare("SELECT id, role, content, created_at FROM events WHERE player_id = ? ORDER BY created_at ASC")
    .all(sourcePlayerId) as EventSnapshotRow[];
  const sourceMemories = database
    .prepare("SELECT id, kind, content, created_at, embedding FROM memories WHERE player_id = ? ORDER BY created_at ASC")
    .all(sourcePlayerId) as MemorySnapshotRow[];
  const sourceCommittedEvents = database
    .prepare(
      "SELECT id, schema_version, event_kind, payload, created_at FROM committed_events WHERE player_id = ? ORDER BY created_at ASC"
    )
    .all(sourcePlayerId) as CommittedEventSnapshotRow[];

  database
    .prepare(
      `INSERT INTO players (id, name, created_at, location, summary, director_state, inventory, flags, quests)
       VALUES (@id, @name, @created_at, @location, @summary, @director_state, @inventory, @flags, @quests)`
    )
    .run({
      ...sourcePlayer,
      id: targetPlayerId
    });

  const insertEvent = database.prepare(
    "INSERT INTO events (id, player_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  sourceEvents.forEach((eventRow) => {
    insertEvent.run(crypto.randomUUID(), targetPlayerId, eventRow.role, eventRow.content, eventRow.created_at);
  });

  const insertMemory = database.prepare(
    "INSERT INTO memories (id, player_id, kind, content, created_at, embedding) VALUES (?, ?, ?, ?, ?, ?)"
  );
  sourceMemories.forEach((memoryRow) => {
    insertMemory.run(
      crypto.randomUUID(),
      targetPlayerId,
      memoryRow.kind,
      memoryRow.content,
      memoryRow.created_at,
      memoryRow.embedding
    );
  });

  const insertCommittedEvent = database.prepare(
    "INSERT INTO committed_events (id, player_id, schema_version, event_kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  sourceCommittedEvents.forEach((eventRow) => {
    const clonedEventId = crypto.randomUUID();
    const payload = cloneCommittedEventPayload(eventRow.payload, targetPlayerId, clonedEventId);
    insertCommittedEvent.run(
      clonedEventId,
      targetPlayerId,
      payload.schema_version,
      payload.event_kind,
      JSON.stringify(payload),
      payload.occurred_at
    );
  });
}

function cloneCommittedEventPayload(rawPayload: string, playerId: string, eventId: string) {
  const payload = parseJson<Record<string, unknown>>(rawPayload, "A saved replay event could not be read.");
  const clonedPayload = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  clonedPayload.event_id = eventId;
  clonedPayload.player_id = playerId;

  if (clonedPayload.event_kind === "player-created") {
    const createdPlayer = clonedPayload.created_player;
    if (!createdPlayer || typeof createdPlayer !== "object") {
      throw new SaveSlotError("slot_corrupted", "A saved player snapshot is missing its bootstrap event data.", 409);
    }

    (createdPlayer as Record<string, unknown>).id = playerId;
  }

  return clonedPayload as {
    schema_version: string;
    event_kind: string;
    occurred_at: string;
  };
}

function deletePlayerGraph(database: Database.Database, playerId: string): void {
  database.prepare("DELETE FROM committed_events WHERE player_id = ?").run(playerId);
  database.prepare("DELETE FROM memories WHERE player_id = ?").run(playerId);
  database.prepare("DELETE FROM events WHERE player_id = ?").run(playerId);
  database.prepare("DELETE FROM players WHERE id = ?").run(playerId);
}

function readPlayerRow(database: Database.Database, playerId: string): PlayerRow | null {
  return (database.prepare("SELECT * FROM players WHERE id = ? LIMIT 1").get(playerId) as PlayerRow | undefined) ?? null;
}

function readSaveSlotRow(database: Database.Database, slotId: string): SaveSlotRow | null {
  return (
    database
      .prepare("SELECT id, label, player_id, source_schema_version, created_at, updated_at FROM save_slots WHERE id = ? LIMIT 1")
      .get(slotId) as SaveSlotRow | undefined
  ) ?? null;
}

function normalizeSlotLabel(params: {
  requestedLabel?: string;
  fallbackLabel: string | null;
  player: PlayerRow;
  savedAt: string;
}): string {
  const requested = params.requestedLabel?.trim();
  if (requested) {
    return requested.slice(0, 80);
  }

  if (params.fallbackLabel) {
    return params.fallbackLabel;
  }

  const timestamp = params.savedAt.slice(0, 16).replace("T", " ");
  return `${params.player.name} - ${params.player.location} - ${timestamp}`;
}

function hydratePlayerStrict(player: PlayerRow): Player {
  return {
    ...player,
    director_state: parseDirectorState(player.director_state),
    inventory: parseStringArray(player.inventory, "Saved inventory data is damaged."),
    flags: parseStringArray(player.flags, "Saved flag data is damaged."),
    quests: parseQuestUpdates(player.quests)
  };
}

function validatePlayerSnapshot(player: PlayerRow): void {
  parseDirectorState(player.director_state);
  parseStringArray(player.inventory, "Saved inventory data is damaged.");
  parseStringArray(player.flags, "Saved flag data is damaged.");
  parseQuestUpdates(player.quests);
}

function parseDirectorState(raw: string): DirectorState {
  const value = parseJson<Record<string, unknown>>(raw, "Saved director progress is damaged.");
  const completedBeats = value.completed_beats;
  if (!Array.isArray(completedBeats) || completedBeats.some((item) => typeof item !== "string")) {
    throw new SaveSlotError("slot_corrupted", "Saved director progress is damaged.", 409);
  }

  const stringFields = [
    "end_goal",
    "current_act_id",
    "current_act",
    "current_beat_id",
    "current_beat_label",
    "end_goal_progress"
  ] as const;
  for (const field of stringFields) {
    if (typeof value[field] !== "string") {
      throw new SaveSlotError("slot_corrupted", "Saved director progress is damaged.", 409);
    }
  }

  if (typeof value.story_beats_remaining !== "number") {
    throw new SaveSlotError("slot_corrupted", "Saved director progress is damaged.", 409);
  }

  return value as unknown as DirectorState;
}

function parseQuestUpdates(raw: string): QuestUpdate[] {
  const value = parseJson<unknown[]>(raw, "Saved quest progress is damaged.");
  if (!Array.isArray(value)) {
    throw new SaveSlotError("slot_corrupted", "Saved quest progress is damaged.", 409);
  }

  value.forEach((item) => {
    if (!item || typeof item !== "object") {
      throw new SaveSlotError("slot_corrupted", "Saved quest progress is damaged.", 409);
    }

    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.status !== "string" || typeof candidate.summary !== "string") {
      throw new SaveSlotError("slot_corrupted", "Saved quest progress is damaged.", 409);
    }
  });

  return value as QuestUpdate[];
}

function parseStringArray(raw: string, message: string): string[] {
  const value = parseJson<unknown[]>(raw, message);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SaveSlotError("slot_corrupted", message, 409);
  }

  return value as string[];
}

function parseJson<T>(raw: string, message: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new SaveSlotError("slot_corrupted", message, 409);
  }
}
