import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  type AuthoritativePlayerState,
  type SaveSlotActionResponsePayload,
  type SaveSlotLoadResponsePayload,
  type SaveSlotSummary,
  type SaveSlotsResponsePayload,
  type StateResponsePayload,
  type TurnResponsePayload,
  type ValidationResult
} from "../../core/types.js";
import {
  prefixValidationErrors,
  validateDirectorState,
  validateQuestUpdates
} from "./shared.js";
import { validateTurnOutput } from "./turn-payload.js";

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

export function validateSaveSlotsResponse(payload: unknown): ValidationResult<string> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["save slots response must be an object."] };
  }

  const candidate = payload as Partial<SaveSlotsResponsePayload> & Record<string, unknown>;
  if (!Array.isArray(candidate.slots)) {
    return { ok: false, errors: ["slots must be an array."] };
  }

  const errors: string[] = [];
  candidate.slots.forEach((slot, index) => {
    errors.push(...validateSaveSlotSummary(slot).map((error) => `slots[${index}].${error}`));
  });

  return { ok: errors.length === 0, errors };
}

export function validateSaveSlotActionResponse(payload: unknown): ValidationResult<string> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["save slot action response must be an object."] };
  }

  const candidate = payload as Partial<SaveSlotActionResponsePayload> & Record<string, unknown>;
  const baseValidation = validateSaveSlotsResponse(candidate);
  const slotErrors = validateSaveSlotSummary(candidate.slot).map((error) => `slot.${error}`);
  const errors = [...baseValidation.errors, ...slotErrors];
  return { ok: errors.length === 0, errors };
}

export function validateSaveSlotLoadResponse(payload: unknown): ValidationResult<string> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["save slot load response must be an object."] };
  }

  const candidate = payload as Partial<SaveSlotLoadResponsePayload> & Record<string, unknown>;
  const baseValidation = validateSaveSlotActionResponse(candidate);
  const playerValidation = prefixValidationErrors(validateAuthoritativePlayerState(candidate.player), "player.");
  const errors = [...baseValidation.errors, ...playerValidation.errors];
  return { ok: errors.length === 0, errors };
}

function validateSaveSlotSummary(slot: unknown): string[] {
  if (!slot || typeof slot !== "object") {
    return ["must be an object."];
  }

  const candidate = slot as Partial<SaveSlotSummary> & Record<string, unknown>;
  const errors: string[] = [];
  ["schema_version", "id", "label", "player_id", "source_schema_version", "saved_at", "updated_at"].forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  if (!(candidate.player_name === null || typeof candidate.player_name === "string")) {
    errors.push("player_name must be a string or null.");
  }

  if (!(candidate.location === null || typeof candidate.location === "string")) {
    errors.push("location must be a string or null.");
  }

  if (!(candidate.status === "ready" || candidate.status === "corrupted" || candidate.status === "incompatible")) {
    errors.push("status must be ready, corrupted, or incompatible.");
  }

  if (!(candidate.detail === null || typeof candidate.detail === "string")) {
    errors.push("detail must be a string or null.");
  }

  return errors;
}
