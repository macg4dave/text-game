export type TurnInputClassificationKind = "action_attempt" | "clarification" | "meta_internal";

export interface TurnInputClassification {
  kind: TurnInputClassificationKind;
  guidance: string;
}

const INTERNAL_TOKEN_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)+$/i;
const CLARIFICATION_PATTERNS = [
  /^(?:what|who|where|when|why)\b/i,
  /^(?:what's|who's|where's)\b/i,
  /^what do you mean\b/i,
  /^how (?:do|can|should) i\b/i,
  /^tell me(?: more)? about\b/i,
  /^remind me\b/i,
  /^describe\b/i,
  /^explain\b/i
];

const ACTION_ATTEMPT_GUIDANCE =
  "Treat this as an in-world action attempt. Propose consequences only if the player is actually trying to do something in the scene.";
const CLARIFICATION_GUIDANCE =
  "This is a clarification or explanation request. Answer groundedly from current context, but do not auto-inspect, auto-use, move, unlock, or advance state.";
const META_INTERNAL_GUIDANCE =
  "This looks like a raw internal token such as a snake_case flag name. Do not treat it as a valid in-world command, and keep state, quest, and director proposals unchanged.";

export function classifyTurnInput(input: string): TurnInputClassification {
  const trimmed = input.trim();

  if (INTERNAL_TOKEN_PATTERN.test(trimmed)) {
    return {
      kind: "meta_internal",
      guidance: META_INTERNAL_GUIDANCE
    };
  }

  if (CLARIFICATION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      kind: "clarification",
      guidance: CLARIFICATION_GUIDANCE
    };
  }

  return {
    kind: "action_attempt",
    guidance: ACTION_ATTEMPT_GUIDANCE
  };
}

export function freezesTurnProgress(classification: TurnInputClassification): boolean {
  return classification.kind !== "action_attempt";
}
