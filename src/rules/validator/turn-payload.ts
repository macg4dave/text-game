import {
  MEMORY_CLASS_RULES,
  TURN_INPUT_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type MemoryCandidate,
  type NpcEncounterFact,
  type StateUpdates,
  type TurnInputPayload,
  type TurnOutputPayload,
  type ValidationResult
} from "../../core/types.js";
import { readOptionalString, validateQuestUpdates } from "./shared.js";

export interface SchemaValidationResult<TValue> extends ValidationResult<string> {
  value: TValue | null;
}

export function validateStateUpdates(updates: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!updates || typeof updates !== "object") {
    errors.push("state_updates must be an object.");
    return { ok: false, errors };
  }

  const typedUpdates = updates as Partial<StateUpdates> & Record<string, unknown>;
  const allowedKeys = new Set(["location", "inventory_add", "inventory_remove", "flags_add", "flags_remove", "quests"]);
  for (const key of Object.keys(typedUpdates)) {
    if (!allowedKeys.has(key)) {
      errors.push(`state_updates.${key} is not allowed in the compact turn schema.`);
    }
  }

  if (typeof typedUpdates.location !== "string") {
    errors.push("state_updates.location must be a string.");
  } else if (!typedUpdates.location.trim()) {
    errors.push("state_updates.location must be a non-empty string.");
  }

  const listFields: Array<keyof Pick<StateUpdates, "inventory_add" | "inventory_remove" | "flags_add" | "flags_remove">> = [
    "inventory_add",
    "inventory_remove",
    "flags_add",
    "flags_remove"
  ];

  listFields.forEach((field) => {
    if (!Array.isArray(typedUpdates[field])) {
      errors.push(`state_updates.${field} must be array.`);
      return;
    }

    if (typedUpdates[field].some((item) => typeof item !== "string")) {
      errors.push(`state_updates.${field} must contain only strings.`);
    } else if (typedUpdates[field].some((item) => !item.trim())) {
      errors.push(`state_updates.${field} must contain only non-empty strings.`);
    }
  });

  if (!Array.isArray(typedUpdates.quests)) {
    errors.push("state_updates.quests must be array.");
  } else {
    errors.push(...validateQuestUpdates(typedUpdates.quests, "state_updates.quests"));
  }

  return { ok: errors.length === 0, errors };
}

export function validateMemoryCandidate(candidate: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, errors: ["memory candidate must be an object."] };
  }

  const typedCandidate = candidate as Partial<MemoryCandidate> & Record<string, unknown>;
  const allowedKeys = new Set(["content", "memory_class", "authority", "source"]);
  for (const key of Object.keys(typedCandidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${key} is not allowed in the memory candidate contract.`);
    }
  }

  if (typeof typedCandidate.content !== "string" || !typedCandidate.content.trim()) {
    errors.push("content must be a non-empty string.");
  }

  if (typeof typedCandidate.memory_class !== "string" || !(typedCandidate.memory_class in MEMORY_CLASS_RULES)) {
    errors.push("memory_class must be one of hard_canon, quest_progress, relationship, world_discovery, or soft_flavor.");
    return { ok: false, errors };
  }

  const rule = MEMORY_CLASS_RULES[typedCandidate.memory_class as keyof typeof MEMORY_CLASS_RULES];
  const allowedSources = rule.allowed_sources as readonly string[];

  if (typedCandidate.authority !== rule.authority) {
    errors.push(`authority for ${typedCandidate.memory_class} must be ${rule.authority}.`);
  }

  if (typedCandidate.source !== "server_commit" && typedCandidate.source !== "summary" && typedCandidate.source !== "narration") {
    errors.push("source must be server_commit, summary, or narration.");
  } else if (!allowedSources.includes(typedCandidate.source)) {
    errors.push(`source ${typedCandidate.source} is not allowed for ${typedCandidate.memory_class}.`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateNpcEncounterFact(fact: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!fact || typeof fact !== "object") {
    return { ok: false, errors: ["npc encounter fact must be an object."] };
  }

  const typedFact = fact as Partial<NpcEncounterFact> & Record<string, unknown>;
  const allowedKeys = new Set([
    "npc_id",
    "display_name",
    "role",
    "location",
    "topics",
    "promises",
    "clues",
    "mood",
    "relationship_change",
    "last_seen_beat",
    "encounter_count",
    "significance",
    "summary",
    "source_event_id",
    "last_seen_at",
    "quest_hooks"
  ]);

  for (const key of Object.keys(typedFact)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${key} is not allowed in the npc encounter fact contract.`);
    }
  }

  validateRequiredString(typedFact.npc_id, "npc_id", errors);
  validateRequiredString(typedFact.display_name, "display_name", errors);
  validateOptionalString(typedFact.role, "role", errors);
  validateOptionalString(typedFact.location, "location", errors);
  validateStringArray(typedFact.topics, "topics", errors);
  validateStringArray(typedFact.promises, "promises", errors);
  validateStringArray(typedFact.clues, "clues", errors);
  validateOptionalString(typedFact.mood, "mood", errors);
  validateOptionalString(typedFact.relationship_change, "relationship_change", errors);
  validateOptionalString(typedFact.last_seen_beat, "last_seen_beat", errors);
  validateStringArray(typedFact.quest_hooks, "quest_hooks", errors, true);
  validateRequiredString(typedFact.summary, "summary", errors);
  validateRequiredString(typedFact.source_event_id, "source_event_id", errors);

  if (!Number.isInteger(typedFact.encounter_count) || (typedFact.encounter_count ?? 0) < 1) {
    errors.push("encounter_count must be an integer greater than or equal to 1.");
  }

  if (typeof typedFact.significance !== "number" || !Number.isFinite(typedFact.significance) || typedFact.significance < 0) {
    errors.push("significance must be a non-negative number.");
  }

  if (typeof typedFact.last_seen_at !== "string" || !typedFact.last_seen_at.trim()) {
    errors.push("last_seen_at must be a non-empty ISO timestamp string.");
  } else if (Number.isNaN(Date.parse(typedFact.last_seen_at))) {
    errors.push("last_seen_at must be a valid ISO timestamp.");
  }

  return { ok: errors.length === 0, errors };
}

export function parseTurnInput(payload: unknown): SchemaValidationResult<TurnInputPayload> {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["turn input must be an object."], value: null };
  }

  const candidate = payload as Record<string, unknown>;
  const schemaVersion = candidate.schema_version;
  if (schemaVersion !== undefined && schemaVersion !== TURN_INPUT_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${TURN_INPUT_SCHEMA_VERSION}.`);
  }

  const input = typeof candidate.input === "string" ? candidate.input.trim() : "";
  if (!input) {
    errors.push("input must be a non-empty string.");
  }

  const playerId = readOptionalString(candidate.player_id ?? candidate.playerId, "player_id", errors);
  const playerName = readOptionalString(candidate.player_name ?? candidate.name, "player_name", errors);

  if (errors.length > 0) {
    return { ok: false, errors, value: null };
  }

  return {
    ok: true,
    errors: [],
    value: {
      schema_version: TURN_INPUT_SCHEMA_VERSION,
      input,
      ...(playerId ? { player_id: playerId } : {}),
      ...(playerName ? { player_name: playerName } : {})
    }
  };
}

export function validateTurnOutput(payload: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["turn output must be an object."] };
  }

  const candidate = payload as Partial<TurnOutputPayload> & Record<string, unknown>;
  const allowedTopLevelKeys = new Set([
    "schema_version",
    "narrative",
    "player_options",
    "state_updates",
    "director_updates",
    "memory_updates"
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowedTopLevelKeys.has(key)) {
      errors.push(`${key} is not allowed in the compact turn schema.`);
    }
  }

  if (candidate.schema_version !== TURN_OUTPUT_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${TURN_OUTPUT_SCHEMA_VERSION}.`);
  }

  if (typeof candidate.narrative !== "string") {
    errors.push("narrative must be a string.");
  } else if (!candidate.narrative.trim()) {
    errors.push("narrative must be a non-empty string.");
  }

  if (!Array.isArray(candidate.player_options)) {
    errors.push("player_options must be an array.");
  } else {
    if (candidate.player_options.some((item) => typeof item !== "string")) {
      errors.push("player_options must contain only strings.");
    } else if (candidate.player_options.some((item) => !item.trim())) {
      errors.push("player_options must contain only non-empty strings.");
    }
    if (candidate.player_options.length > 6) {
      errors.push("player_options must contain at most 6 entries.");
    }
  }

  errors.push(...validateStateUpdates(candidate.state_updates).errors);

  if (!candidate.director_updates || typeof candidate.director_updates !== "object") {
    errors.push("director_updates must be an object.");
  } else {
    const allowedDirectorKeys = new Set(["end_goal_progress"]);
    const typedDirectorUpdates = candidate.director_updates as unknown as Record<string, unknown>;
    for (const key of Object.keys(typedDirectorUpdates)) {
      if (!allowedDirectorKeys.has(key)) {
        errors.push(`director_updates.${key} is not allowed in the compact turn schema.`);
      }
    }

    if (typeof typedDirectorUpdates.end_goal_progress !== "string") {
      errors.push("director_updates.end_goal_progress must be a string.");
    } else if (!typedDirectorUpdates.end_goal_progress.trim()) {
      errors.push("director_updates.end_goal_progress must be a non-empty string.");
    }
  }

  if (!Array.isArray(candidate.memory_updates)) {
    errors.push("memory_updates must be an array.");
  } else {
    if (candidate.memory_updates.some((item) => typeof item !== "string")) {
      errors.push("memory_updates must contain only strings.");
    } else if (candidate.memory_updates.some((item) => !item.trim())) {
      errors.push("memory_updates must contain only non-empty strings.");
    }
    if (candidate.memory_updates.length > 8) {
      errors.push("memory_updates must contain at most 8 entries.");
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateRequiredString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${field} must be a non-empty string.`);
  }
}

function validateOptionalString(value: unknown, field: string, errors: string[]): void {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${field} must be a non-empty string or null.`);
  }
}

function validateStringArray(value: unknown, field: string, errors: string[], optional = false): void {
  if (optional && (value === undefined || value === null)) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array.`);
    return;
  }

  if (value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${field} must contain only non-empty strings.`);
  }
}
