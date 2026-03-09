import type { ValidationResult } from "../core/types.js";

const TURN_RESPONSE_SCHEMA_NAME = "game_turn_proposal";
const TURN_RESPONSE_REQUIRED_FIELDS = ["narrative", "player_options", "state_updates", "director_updates", "memory_updates"] as const;
const PROPOSAL_ONLY_FIELDS = ["state_updates", "director_updates", "memory_updates"] as const;
const BANNED_FIELD_PATHS = [
  "scene",
  "world_state",
  "director_state",
  "player",
  "player_state",
  "state_updates.world_state",
  "state_updates.director_state",
  "director_updates.current_act_id",
  "director_updates.current_act",
  "director_updates.current_beat_id",
  "director_updates.current_beat_label"
] as const;

export const TURN_RESPONSE_SCHEMA = {
  name: TURN_RESPONSE_SCHEMA_NAME,
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      narrative: {
        type: "string",
        description:
          "Narration that frames the plausible attempted outcome while staying compatible with committed STATE_PACK facts and any still-uncommitted proposals."
      },
      player_options: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 6,
        description: "Short player-facing options that fit the narrated situation without implying committed truth."
      },
      state_updates: {
        type: "object",
        description:
          "Transitional legacy field name. These are candidate simulation or world consequences only; the server decides what becomes committed truth. They must not encode beat permission or pacing control.",
        additionalProperties: false,
        properties: {
          location: { type: "string" },
          inventory_add: { type: "array", items: { type: "string" } },
          inventory_remove: { type: "array", items: { type: "string" } },
          flags_add: { type: "array", items: { type: "string" } },
          flags_remove: { type: "array", items: { type: "string" } },
          quests: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                status: { type: "string" },
                summary: { type: "string" }
              },
              required: ["id", "status", "summary"]
            }
          }
        },
        required: ["location", "inventory_add", "inventory_remove", "flags_add", "flags_remove", "quests"]
      },
      director_updates: {
        type: "object",
        description:
          "Transitional legacy field name. This contains compact candidate pacing or framing consequences only; the server decides what becomes committed truth and authoritative director state. It must not decide plausibility or permission.",
        additionalProperties: false,
        properties: {
          end_goal_progress: { type: "string" }
        },
        required: ["end_goal_progress"]
      },
      memory_updates: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 8,
        description:
          "Transitional legacy field name. These are candidate memory facts for the server to accept or reject. Do not encode scene or world structures here."
      }
    },
    required: [...TURN_RESPONSE_REQUIRED_FIELDS]
  }
} as const;

export function validateTurnResponseSchemaContract(schema = TURN_RESPONSE_SCHEMA): ValidationResult<string> {
  const errors: string[] = [];

  if (schema.name !== TURN_RESPONSE_SCHEMA_NAME) {
    errors.push(`json_schema.name must stay ${TURN_RESPONSE_SCHEMA_NAME}.`);
  }

  if (schema.strict !== true) {
    errors.push("json_schema.strict must remain true.");
  }

  if (schema.schema.type !== "object") {
    errors.push("turn response schema root must stay an object.");
  }

  if (schema.schema.additionalProperties !== false) {
    errors.push("turn response schema root must reject additional properties.");
  }

  const properties = schema.schema.properties as Record<string, unknown>;
  const topLevelKeys = Object.keys(properties);
  if (!haveSameEntries(topLevelKeys, [...TURN_RESPONSE_REQUIRED_FIELDS])) {
    errors.push(
      `turn response schema root properties must stay exactly ${TURN_RESPONSE_REQUIRED_FIELDS.join(", ")}.`
    );
  }

  const requiredFields = [...schema.schema.required];
  if (!haveSameEntries(requiredFields, [...TURN_RESPONSE_REQUIRED_FIELDS])) {
    errors.push(
      `turn response schema required fields must stay exactly ${TURN_RESPONSE_REQUIRED_FIELDS.join(", ")}.`
    );
  }

  for (const field of PROPOSAL_ONLY_FIELDS) {
    const description = getPropertyDescription(properties, field);
    if (!/(candidate|proposal)/i.test(description) || !/(server|committed truth|accept|reject)/i.test(description)) {
      errors.push(`${field} description must keep proposal-only and server-owned semantics explicit.`);
    }
  }

  const narrativeDescription = getPropertyDescription(properties, "narrative");
  if (!/(plausible|attempted outcome|attempted action)/i.test(narrativeDescription)) {
    errors.push("narrative description must frame output around the attempted outcome rather than committed truth alone.");
  }

  const stateUpdatesDescription = getPropertyDescription(properties, "state_updates");
  if (!/(simulation|world consequence)/i.test(stateUpdatesDescription) || !/(not .* beat|not .* pacing|must not encode beat permission)/i.test(stateUpdatesDescription)) {
    errors.push("state_updates description must keep simulation consequences separate from beat permission or pacing control.");
  }

  const directorUpdatesDescription = getPropertyDescription(properties, "director_updates");
  if (!/(pacing|framing)/i.test(directorUpdatesDescription) || !/(not .* plausibility|not .* permission|must not decide plausibility)/i.test(directorUpdatesDescription)) {
    errors.push("director_updates description must keep pacing or framing separate from plausibility and permission logic.");
  }

  for (const path of BANNED_FIELD_PATHS) {
    if (hasSchemaPropertyPath(properties, path)) {
      errors.push(`${path} is not allowed in the compact turn schema contract.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertTurnResponseSchemaContract(schema = TURN_RESPONSE_SCHEMA): void {
  const result = validateTurnResponseSchemaContract(schema);
  if (!result.ok) {
    throw new Error(result.errors.join(" "));
  }
}

function getPropertyDescription(properties: Record<string, unknown>, key: string): string {
  const value = properties[key];
  if (!value || typeof value !== "object" || !("description" in value) || typeof value.description !== "string") {
    return "";
  }

  return value.description;
}

function hasSchemaPropertyPath(properties: Record<string, unknown>, path: string): boolean {
  const [head, ...tail] = path.split(".");
  const value = properties[head];
  if (!value || typeof value !== "object") {
    return false;
  }

  if (tail.length === 0) {
    return true;
  }

  if (!("properties" in value) || !value.properties || typeof value.properties !== "object") {
    return false;
  }

  return hasSchemaPropertyPath(value.properties as Record<string, unknown>, tail.join("."));
}

function haveSameEntries(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }

  const actualSet = new Set(actual);
  return expected.every((entry) => actualSet.has(entry));
}
