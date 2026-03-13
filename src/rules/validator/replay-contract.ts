import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  COMMITTED_EVENT_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalEventCommittedChanges,
  type CanonicalEventPayload,
  type CanonicalPlayerCreatedEventPayload,
  type ValidationResult
} from "../../core/types.js";
import {
  prefixMessages,
  prefixValidationErrors,
  validateNullableStringField
} from "./shared.js";
import { validateAuthoritativePlayerState } from "./state-contract.js";
import { validateStateUpdates } from "./turn-payload.js";

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
  const allowedKeys = new Set(["transcript", "presentation", "proposal_presentation", "prompt"]);
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

  if ("proposal_presentation" in candidate) {
    errors.push(...validateCanonicalEventPresentation(candidate.proposal_presentation, "supplemental.proposal_presentation"));
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

function validateCanonicalEventPresentation(
  presentation: unknown,
  fieldName = "supplemental.presentation"
): string[] {
  if (!presentation || typeof presentation !== "object") {
    return [`${fieldName} must be an object.`];
  }

  const candidate = presentation as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set(["narrative", "player_options"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${fieldName}.${key} is not allowed in the canonical event schema.`);
    }
  }

  errors.push(...validateNullableStringField(candidate.narrative, `${fieldName}.narrative`));

  if (!Array.isArray(candidate.player_options)) {
    errors.push(`${fieldName}.player_options must be an array.`);
  } else if (candidate.player_options.some((item) => typeof item !== "string")) {
    errors.push(`${fieldName}.player_options must contain only strings.`);
  }

  return errors;
}
