import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  COMMITTED_EVENT_SCHEMA_VERSION,
  MEMORY_CLASS_RULES,
  TURN_INPUT_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalEventPayload,
  type CanonicalEventCommittedChanges,
  type CanonicalPlayerCreatedEventPayload,
  type CanonicalTurnEventPayload,
  type AuthoritativePlayerState,
  type DirectorSpec,
  type DirectorState,
  type MemoryCandidate,
  type QuestSpec,
  type QuestUpdate,
  type RuntimePreflightIssue,
  type RuntimePreflightReport,
  type SetupStatusPayload,
  type StateResponsePayload,
  type StateUpdates,
  type TurnInputPayload,
  type TurnResponsePayload,
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
  const allowedKeys = new Set(["location", "inventory_add", "inventory_remove", "flags_add", "flags_remove", "quests"]);
  for (const key of Object.keys(typedUpdates)) {
    if (!allowedKeys.has(key)) {
      errors.push(`state_updates.${key} is not allowed in the compact turn schema.`);
    }
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

  // `*_updates` remains the v1 field shape, but these slots are proposal-only.
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

    if (typeof candidate.director_updates.end_goal_progress !== "string") {
      errors.push("director_updates.end_goal_progress must be a string.");
    }
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

export function validateCanonicalTurnEvent(payload: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["canonical event must be an object."] };
  }

  const candidate = payload as Partial<CanonicalEventPayload> & Record<string, unknown>;
  const allowedTopLevelKeys = new Set([
    "schema_version",
    "event_kind",
    "event_id",
    "player_id",
    "occurred_at",
    "contract_versions",
    "supplemental",
    "attempt",
    "outcome",
    "committed",
    "created_player"
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowedTopLevelKeys.has(key)) {
      errors.push(`${key} is not allowed in the canonical event schema.`);
    }
  }

  if (candidate.schema_version !== COMMITTED_EVENT_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${COMMITTED_EVENT_SCHEMA_VERSION}.`);
  }

  if (!(candidate.event_kind === "turn-resolution" || candidate.event_kind === "player-created")) {
    errors.push("event_kind must be turn-resolution or player-created.");
  }

  if (typeof candidate.event_id !== "string") {
    errors.push("event_id must be a string.");
  }

  if (typeof candidate.player_id !== "string") {
    errors.push("player_id must be a string.");
  }

  if (typeof candidate.occurred_at !== "string") {
    errors.push("occurred_at must be a string.");
  }

  errors.push(...validateCanonicalEventContractVersions(candidate.contract_versions));
  errors.push(...validateCanonicalEventSupplemental(candidate.supplemental));

  if (candidate.event_kind === "turn-resolution") {
    errors.push(...validateCanonicalEventAttempt(candidate.attempt));
    errors.push(...validateCanonicalEventOutcome(candidate.outcome));
    errors.push(...validateCanonicalEventCommittedChanges(candidate.committed));
  }

  if (candidate.event_kind === "player-created") {
    errors.push(...validateCanonicalPlayerCreatedEvent(candidate));
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

export function validateStateResponse(payload: unknown): ValidationResult<string> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["state response must be an object."] };
  }

  const candidate = payload as Partial<StateResponsePayload> & Record<string, unknown>;
  if (!candidate.player || typeof candidate.player !== "object") {
    return { ok: false, errors: ["player must be an object."] };
  }

  return prefixValidationErrors(validateAuthoritativePlayerState(candidate.player), "player.");
}

export function validateTurnResponse(payload: unknown): ValidationResult<string> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["turn response must be an object."] };
  }

  // The turn payload may contain proposal fields, but `player` is the authoritative snapshot.
  const candidate = payload as Partial<TurnResponsePayload> & Record<string, unknown>;
  const turnPayloadCandidate = { ...candidate };
  delete turnPayloadCandidate.player;
  const turnErrors = validateTurnOutput(turnPayloadCandidate).errors;

  if (!candidate.player || typeof candidate.player !== "object") {
    return {
      ok: false,
      errors: [...turnErrors, "player must be an object."]
    };
  }

  const playerValidation = prefixValidationErrors(validateAuthoritativePlayerState(candidate.player), "player.");
  const errors = [...turnErrors, ...playerValidation.errors];
  return { ok: errors.length === 0, errors };
}

export function validateSetupStatusResponse(payload: unknown): ValidationResult<string> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["setup status response must be an object."] };
  }

  const candidate = payload as Partial<SetupStatusPayload> & Record<string, unknown>;
  if (!candidate.setup || typeof candidate.setup !== "object") {
    return { ok: false, errors: ["setup must be an object."] };
  }

  const setup = candidate.setup as unknown as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof setup.status !== "string") {
    errors.push("setup.status must be a string.");
  }
  if (typeof setup.summary !== "string") {
    errors.push("setup.summary must be a string.");
  }
  if (!(setup.checked_at === null || typeof setup.checked_at === "string")) {
    errors.push("setup.checked_at must be a string or null.");
  }
  if (typeof setup.can_retry !== "boolean") {
    errors.push("setup.can_retry must be a boolean.");
  }

  errors.push(...validateSetupCurrentProfile(setup.current_profile).map((error) => `setup.current_profile.${error}`));
  errors.push(...validateSetupSupportedPath(setup.supported_path).map((error) => `setup.supported_path.${error}`));
  errors.push(...validateRuntimePreflightReport(setup.preflight).map((error) => `setup.preflight.${error}`));

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

function prefixValidationErrors(result: ValidationResult<string>, prefix: string): ValidationResult<string> {
  return {
    ok: result.ok,
    errors: result.errors.map((error) => `${prefix}${error}`)
  };
}

function validateSetupCurrentProfile(profile: unknown): string[] {
  if (!profile || typeof profile !== "object") {
    return ["must be an object."];
  }

  const candidate = profile as Record<string, unknown>;
  const errors: string[] = [];
  ["id", "label", "provider", "chat_model", "embedding_model"].forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  return errors;
}

function validateSetupSupportedPath(path: unknown): string[] {
  if (!path || typeof path !== "object") {
    return ["must be an object."];
  }

  const candidate = path as Record<string, unknown>;
  const errors: string[] = [];
  ["provider", "title", "summary", "launcher"].forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  if (!Array.isArray(candidate.services)) {
    errors.push("services must be an array.");
  } else if (candidate.services.some((service) => typeof service !== "string")) {
    errors.push("services must contain only strings.");
  }

  return errors;
}

function validateRuntimePreflightReport(report: unknown): string[] {
  if (!report || typeof report !== "object") {
    return ["must be an object."];
  }

  const candidate = report as Partial<RuntimePreflightReport> & Record<string, unknown>;
  const errors: string[] = [];
  if (typeof candidate.ok !== "boolean") {
    errors.push("ok must be a boolean.");
  }
  if (typeof candidate.status !== "string") {
    errors.push("status must be a string.");
  }
  if (typeof candidate.summary !== "string") {
    errors.push("summary must be a string.");
  }
  if (!(candidate.checked_at === null || typeof candidate.checked_at === "string")) {
    errors.push("checked_at must be a string or null.");
  }

  if (!candidate.counts || typeof candidate.counts !== "object") {
    errors.push("counts must be an object.");
  } else {
    const counts = candidate.counts as unknown as Record<string, unknown>;
    ["blocker", "warning", "info"].forEach((field) => {
      if (typeof counts[field] !== "number") {
        errors.push(`counts.${field} must be a number.`);
      }
    });
  }

  if (!Array.isArray(candidate.issues)) {
    errors.push("issues must be an array.");
  } else {
    candidate.issues.forEach((issue, index) => {
      errors.push(...validateRuntimePreflightIssue(issue).map((error) => `issues[${index}].${error}`));
    });
  }

  return errors;
}

function validateRuntimePreflightIssue(issue: unknown): string[] {
  if (!issue || typeof issue !== "object") {
    return ["must be an object."];
  }

  const candidate = issue as Partial<RuntimePreflightIssue> & Record<string, unknown>;
  const errors: string[] = [];
  ["code", "severity", "area", "title", "message"].forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  if (!(candidate.recommended_fix === null || typeof candidate.recommended_fix === "string")) {
    errors.push("recommended_fix must be a string or null.");
  }

  if (!Array.isArray(candidate.recovery)) {
    errors.push("recovery must be an array.");
  } else if (candidate.recovery.some((item) => typeof item !== "string")) {
    errors.push("recovery must contain only strings.");
  }

  if (!Array.isArray(candidate.env_vars)) {
    errors.push("env_vars must be an array.");
  } else if (candidate.env_vars.some((item) => typeof item !== "string")) {
    errors.push("env_vars must contain only strings.");
  }

  return errors;
}

function validateCanonicalEventAttempt(attempt: unknown): string[] {
  if (!attempt || typeof attempt !== "object") {
    return ["attempt must be an object."];
  }

  const candidate = attempt as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["input"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`attempt.${key} is not allowed in the canonical event schema.`);
    }
  }

  if (typeof candidate.input !== "string" || !candidate.input.trim()) {
    errors.push("attempt.input must be a non-empty string.");
  }

  return errors;
}

function validateCanonicalPlayerCreatedEvent(event: Partial<CanonicalPlayerCreatedEventPayload> & Record<string, unknown>): string[] {
  const errors: string[] = [];
  const allowedKeys = new Set([
    "schema_version",
    "event_kind",
    "event_id",
    "player_id",
    "occurred_at",
    "contract_versions",
    "supplemental",
    "created_player"
  ]);

  for (const key of Object.keys(event)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${key} is not allowed in the canonical event schema.`);
    }
  }

  if (!("created_player" in event)) {
    errors.push("created_player must be present for player-created events.");
    return errors;
  }

  errors.push(...prefixValidationErrors(validateAuthoritativePlayerState(event.created_player), "created_player.").errors);
  if (event.created_player && typeof event.created_player === "object" && "id" in event.created_player && event.created_player.id !== event.player_id) {
    errors.push("created_player.id must match player_id.");
  }

  return errors;
}

function validateCanonicalEventOutcome(outcome: unknown): string[] {
  if (!outcome || typeof outcome !== "object") {
    return ["outcome must be an object."];
  }

  const candidate = outcome as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["status", "summary", "rejection_reason"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`outcome.${key} is not allowed in the canonical event schema.`);
    }
  }

  if (!(candidate.status === "accepted" || candidate.status === "rejected")) {
    errors.push("outcome.status must be accepted or rejected.");
  }

  if (typeof candidate.summary !== "string" || !candidate.summary.trim()) {
    errors.push("outcome.summary must be a non-empty string.");
  }

  if (!(candidate.rejection_reason === null || typeof candidate.rejection_reason === "string")) {
    errors.push("outcome.rejection_reason must be a string or null.");
  }

  return errors;
}

function validateCanonicalEventCommittedChanges(committed: unknown): string[] {
  if (!committed || typeof committed !== "object") {
    return ["committed must be an object."];
  }

  const candidate = committed as Partial<CanonicalEventCommittedChanges> & Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["state_updates", "director_updates", "memory_updates"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`committed.${key} is not allowed in the canonical event schema.`);
    }
  }

  if (!(candidate.state_updates === null || candidate.state_updates === undefined)) {
    errors.push(...prefixMessages(validateStateUpdates(candidate.state_updates).errors, "committed."));
  }

  if (!(candidate.director_updates === null || candidate.director_updates === undefined)) {
    if (!candidate.director_updates || typeof candidate.director_updates !== "object") {
      errors.push("committed.director_updates must be an object or null.");
    } else {
      const allowedDirectorKeys = new Set(["end_goal_progress"]);
      const typedDirectorUpdates = candidate.director_updates as unknown as Record<string, unknown>;
      for (const key of Object.keys(typedDirectorUpdates)) {
        if (!allowedDirectorKeys.has(key)) {
          errors.push(`committed.director_updates.${key} is not allowed in the canonical event schema.`);
        }
      }

      if (typeof typedDirectorUpdates.end_goal_progress !== "string") {
        errors.push("committed.director_updates.end_goal_progress must be a string.");
      }
    }
  }

  if (!Array.isArray(candidate.memory_updates)) {
    errors.push("committed.memory_updates must be an array.");
  } else if (candidate.memory_updates.some((item) => typeof item !== "string")) {
    errors.push("committed.memory_updates must contain only strings.");
  }

  return errors;
}

function validateCanonicalEventContractVersions(contractVersions: unknown): string[] {
  if (!contractVersions || typeof contractVersions !== "object") {
    return ["contract_versions must be an object."];
  }

  const candidate = contractVersions as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["turn_output", "authoritative_state", "ruleset"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`contract_versions.${key} is not allowed in the canonical event schema.`);
    }
  }

  if (candidate.turn_output !== TURN_OUTPUT_SCHEMA_VERSION) {
    errors.push(`contract_versions.turn_output must be ${TURN_OUTPUT_SCHEMA_VERSION}.`);
  }

  if (candidate.authoritative_state !== AUTHORITATIVE_STATE_SCHEMA_VERSION) {
    errors.push(`contract_versions.authoritative_state must be ${AUTHORITATIVE_STATE_SCHEMA_VERSION}.`);
  }

  if (typeof candidate.ruleset !== "string" || !candidate.ruleset.trim()) {
    errors.push("contract_versions.ruleset must be a non-empty string.");
  }

  return errors;
}

function validateCanonicalEventSupplemental(supplemental: unknown): string[] {
  if (supplemental === undefined) {
    return [];
  }

  if (!supplemental || typeof supplemental !== "object") {
    return ["supplemental must be an object when provided."];
  }

  const candidate = supplemental as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["transcript", "presentation", "prompt"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`supplemental.${key} is not allowed in the canonical event schema.`);
    }
  }

  if ("transcript" in candidate) {
    errors.push(...validateCanonicalEventTranscript(candidate.transcript));
  }

  if ("presentation" in candidate) {
    errors.push(...validateCanonicalEventPresentation(candidate.presentation));
  }

  return errors;
}

function validateCanonicalEventTranscript(transcript: unknown): string[] {
  if (!transcript || typeof transcript !== "object") {
    return ["supplemental.transcript must be an object."];
  }

  const candidate = transcript as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["player_text", "narrator_text"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`supplemental.transcript.${key} is not allowed in the canonical event schema.`);
    }
  }

  errors.push(...validateNullableStringField(candidate.player_text, "supplemental.transcript.player_text"));
  errors.push(...validateNullableStringField(candidate.narrator_text, "supplemental.transcript.narrator_text"));
  return errors;
}

function validateCanonicalEventPresentation(presentation: unknown): string[] {
  if (!presentation || typeof presentation !== "object") {
    return ["supplemental.presentation must be an object."];
  }

  const candidate = presentation as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["narrative", "player_options"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`supplemental.presentation.${key} is not allowed in the canonical event schema.`);
    }
  }

  errors.push(...validateNullableStringField(candidate.narrative, "supplemental.presentation.narrative"));

  if (!Array.isArray(candidate.player_options)) {
    errors.push("supplemental.presentation.player_options must be an array.");
  } else if (candidate.player_options.some((item) => typeof item !== "string")) {
    errors.push("supplemental.presentation.player_options must contain only strings.");
  }

  return errors;
}

function validateNullableStringField(value: unknown, fieldName: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (value === null || typeof value === "string") {
    return [];
  }

  return [`${fieldName} must be a string or null.`];
}

function prefixMessages(messages: string[], prefix: string): string[] {
  return messages.map((message) => `${prefix}${message}`);
}
