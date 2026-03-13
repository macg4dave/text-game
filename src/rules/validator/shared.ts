import {
  type DirectorState,
  type QuestUpdate,
  type ValidationResult
} from "../../core/types.js";

export function readOptionalString(value: unknown, fieldName: string, errors: string[]): string | undefined {
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

export function validateQuestUpdates(quests: unknown[], pathPrefix: string): string[] {
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

export function validateDirectorState(state: unknown): string[] {
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

export function prefixValidationErrors(result: ValidationResult<string>, prefix: string): ValidationResult<string> {
  return {
    ok: result.ok,
    errors: result.errors.map((error) => `${prefix}${error}`)
  };
}

export function prefixMessages(messages: string[], prefix: string): string[] {
  return messages.map((message) => `${prefix}${message}`);
}

export function validateNullableStringField(value: unknown, fieldName: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (value === null || typeof value === "string") {
    return [];
  }

  return [`${fieldName} must be a string or null.`];
}
