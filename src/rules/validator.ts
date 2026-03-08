import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  TURN_INPUT_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type AuthoritativePlayerState,
  type DirectorSpec,
  type DirectorState,
  type QuestSpec,
  type QuestUpdate,
  type StateUpdates,
  type TurnInputPayload,
  type TurnOutputPayload,
  type ValidationResult
} from "../core/types.js";

export interface DirectorSpecValidationResult extends ValidationResult<string> {
  beatIds: string[];
  flags: string[];
}

export interface SchemaValidationResult<TValue> extends ValidationResult<string> {
  value: TValue | null;
}

export function validateDirectorSpec(spec: unknown): DirectorSpecValidationResult {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") {
    errors.push("Spec must be an object.");
    return { ok: false, errors, beatIds: [], flags: [] };
  }

  const typedSpec = spec as Partial<DirectorSpec>;

  if (!typedSpec.end_goal || typeof typedSpec.end_goal !== "string") {
    errors.push("Spec must include end_goal (string).");
  }

  if (!Array.isArray(typedSpec.acts) || !typedSpec.acts.length) {
    errors.push("Spec must include non-empty acts array.");
  }

  const beatIds = new Set<string>();
  const flagIndex = new Set<string>();

  (typedSpec.acts || []).forEach((act, actIndex) => {
    if (!act.id || typeof act.id !== "string") {
      errors.push(`Act ${actIndex} missing id.`);
    }
    if (!act.name || typeof act.name !== "string") {
      errors.push(`Act ${actIndex} missing name.`);
    }
    if (!Array.isArray(act.beats) || !act.beats.length) {
      errors.push(`Act ${actIndex} must include beats.`);
      return;
    }

    act.beats.forEach((beat, beatIndex) => {
      if (!beat.id || typeof beat.id !== "string") {
        errors.push(`Beat ${actIndex}.${beatIndex} missing id.`);
      } else if (beatIds.has(beat.id)) {
        errors.push(`Duplicate beat id: ${beat.id}`);
      } else {
        beatIds.add(beat.id);
      }

      if (!beat.label || typeof beat.label !== "string") {
        errors.push(`Beat ${actIndex}.${beatIndex} missing label.`);
      }

      if (beat.required_flags && !Array.isArray(beat.required_flags)) {
        errors.push(`Beat ${beat.id} required_flags must be array.`);
      }

      if (beat.unlock_flags && !Array.isArray(beat.unlock_flags)) {
        errors.push(`Beat ${beat.id} unlock_flags must be array.`);
      }

      (beat.unlock_flags || []).forEach((flag) => flagIndex.add(flag));
    });
  });

  return { ok: errors.length === 0, errors, beatIds: Array.from(beatIds), flags: Array.from(flagIndex) };
}

export function validateStateUpdates(updates: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!updates || typeof updates !== "object") {
    errors.push("state_updates must be an object.");
    return { ok: false, errors };
  }

  const typedUpdates = updates as Partial<StateUpdates> & Record<string, unknown>;
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
    }
  });

  if (!Array.isArray(typedUpdates.quests)) {
    errors.push("state_updates.quests must be array.");
  } else {
    errors.push(...validateQuestUpdates(typedUpdates.quests, "state_updates.quests"));
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
  if (candidate.schema_version !== TURN_OUTPUT_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${TURN_OUTPUT_SCHEMA_VERSION}.`);
  }

  if (typeof candidate.narrative !== "string") {
    errors.push("narrative must be a string.");
  }

  if (!Array.isArray(candidate.player_options)) {
    errors.push("player_options must be an array.");
  } else {
    if (candidate.player_options.some((item) => typeof item !== "string")) {
      errors.push("player_options must contain only strings.");
    }
    if (candidate.player_options.length > 6) {
      errors.push("player_options must contain at most 6 entries.");
    }
  }

  errors.push(...validateStateUpdates(candidate.state_updates).errors);

  if (!candidate.director_updates || typeof candidate.director_updates !== "object") {
    errors.push("director_updates must be an object.");
  } else if (typeof candidate.director_updates.end_goal_progress !== "string") {
    errors.push("director_updates.end_goal_progress must be a string.");
  }

  if (!Array.isArray(candidate.memory_updates)) {
    errors.push("memory_updates must be an array.");
  } else {
    if (candidate.memory_updates.some((item) => typeof item !== "string")) {
      errors.push("memory_updates must contain only strings.");
    }
    if (candidate.memory_updates.length > 8) {
      errors.push("memory_updates must contain at most 8 entries.");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateAuthoritativePlayerState(payload: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["authoritative player state must be an object."] };
  }

  const candidate = payload as Partial<AuthoritativePlayerState> & Record<string, unknown>;
  if (candidate.schema_version !== AUTHORITATIVE_STATE_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${AUTHORITATIVE_STATE_SCHEMA_VERSION}.`);
  }

  const stringFields: Array<keyof Pick<AuthoritativePlayerState, "id" | "name" | "created_at" | "location" | "summary">> = [
    "id",
    "name",
    "created_at",
    "location",
    "summary"
  ];
  stringFields.forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  if (!Array.isArray(candidate.inventory)) {
    errors.push("inventory must be an array.");
  } else if (candidate.inventory.some((item) => typeof item !== "string")) {
    errors.push("inventory must contain only strings.");
  }

  if (!Array.isArray(candidate.flags)) {
    errors.push("flags must be an array.");
  } else if (candidate.flags.some((item) => typeof item !== "string")) {
    errors.push("flags must contain only strings.");
  }

  if (!Array.isArray(candidate.quests)) {
    errors.push("quests must be an array.");
  } else {
    errors.push(...validateQuestUpdates(candidate.quests, "quests"));
  }

  if (!candidate.director_state || typeof candidate.director_state !== "object") {
    errors.push("director_state must be an object.");
  } else {
    errors.push(...validateDirectorState(candidate.director_state));
  }

  return { ok: errors.length === 0, errors };
}

export function validateQuestSpec(spec: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") {
    errors.push("Quest spec must be an object.");
    return { ok: false, errors };
  }

  const typedSpec = spec as Partial<QuestSpec>;
  if (!Array.isArray(typedSpec.quests)) {
    errors.push("Quest spec must include quests array.");
    return { ok: false, errors };
  }

  const questIds = new Set<string>();
  typedSpec.quests.forEach((quest, idx) => {
    if (!quest.id || typeof quest.id !== "string") {
      errors.push(`Quest ${idx} missing id.`);
      return;
    }
    if (questIds.has(quest.id)) {
      errors.push(`Duplicate quest id: ${quest.id}`);
    }
    questIds.add(quest.id);

    if (!quest.title || typeof quest.title !== "string") {
      errors.push(`Quest ${quest.id} missing title.`);
    }
    if (!Array.isArray(quest.stages) || !quest.stages.length) {
      errors.push(`Quest ${quest.id} must include stages.`);
    }

    (quest.stages || []).forEach((stage, stageIndex) => {
      if (!stage.id || typeof stage.id !== "string") {
        errors.push(`Quest ${quest.id} stage ${stageIndex} missing id.`);
      }
      if (!stage.label || typeof stage.label !== "string") {
        errors.push(`Quest ${quest.id} stage ${stageIndex} missing label.`);
      }
      if (stage.required_flags && !Array.isArray(stage.required_flags)) {
        errors.push(`Quest ${quest.id} stage ${stage.id} required_flags must be array.`);
      }
      if (stage.unlock_flags && !Array.isArray(stage.unlock_flags)) {
        errors.push(`Quest ${quest.id} stage ${stage.id} unlock_flags must be array.`);
      }
    });
  });

  return { ok: errors.length === 0, errors };
}

function readOptionalString(value: unknown, fieldName: string, errors: string[]): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push(`${fieldName} must be a string when provided.`);
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

function validateQuestUpdates(quests: unknown[], pathPrefix: string): string[] {
  const errors: string[] = [];
  quests.forEach((quest, index) => {
    if (!quest || typeof quest !== "object") {
      errors.push(`${pathPrefix}[${index}] must be an object.`);
      return;
    }

    const candidate = quest as Partial<QuestUpdate>;
    if (typeof candidate.id !== "string") {
      errors.push(`${pathPrefix}[${index}].id must be a string.`);
    }
    if (typeof candidate.status !== "string") {
      errors.push(`${pathPrefix}[${index}].status must be a string.`);
    }
    if (typeof candidate.summary !== "string") {
      errors.push(`${pathPrefix}[${index}].summary must be a string.`);
    }
  });

  return errors;
}

function validateDirectorState(state: unknown): string[] {
  if (!state || typeof state !== "object") {
    return ["director_state must be an object."];
  }

  const candidate = state as Partial<DirectorState>;
  const errors: string[] = [];
  const stringFields: Array<keyof Pick<
    DirectorState,
    "end_goal" | "current_act_id" | "current_act" | "current_beat_id" | "current_beat_label" | "end_goal_progress"
  >> = ["end_goal", "current_act_id", "current_act", "current_beat_id", "current_beat_label", "end_goal_progress"];

  stringFields.forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`director_state.${field} must be a string.`);
    }
  });

  if (typeof candidate.story_beats_remaining !== "number") {
    errors.push("director_state.story_beats_remaining must be a number.");
  }

  if (!Array.isArray(candidate.completed_beats)) {
    errors.push("director_state.completed_beats must be an array.");
  } else if (candidate.completed_beats.some((item) => typeof item !== "string")) {
    errors.push("director_state.completed_beats must contain only strings.");
  }

  return errors;
}
