import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  COMMITTED_EVENT_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalEventCommittedChanges,
  type CanonicalEventOutcome,
  type CanonicalEventSupplemental,
  type CanonicalTurnEventPayload,
  type AuthoritativePlayerState,
  type Player,
  type StateResponsePayload,
  type TurnOutputPayload,
  type TurnResponsePayload
} from "../core/types.js";

export function createAuthoritativePlayerState(player: Player): AuthoritativePlayerState {
  return {
    schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
    ...player
  };
}

export function createStateResponsePayload(player: AuthoritativePlayerState): StateResponsePayload {
  return {
    player
  };
}

export function createTurnResponsePayload(
  turnOutput: TurnOutputPayload,
  player: AuthoritativePlayerState
): TurnResponsePayload {
  // `turnOutput` contains proposal fields from the model-facing contract.
  // The committed truth sent back to clients is the authoritative `player` snapshot.
  return {
    ...turnOutput,
    player
  };
}

export interface CreateCommittedTurnEventPayloadParams {
  eventId: string;
  playerId: string;
  occurredAt: string;
  input: string;
  outcome: CanonicalEventOutcome;
  committed: CanonicalEventCommittedChanges;
  rulesetVersion: string;
  supplemental?: CanonicalEventSupplemental;
}

export function createCommittedTurnEventPayload({
  eventId,
  playerId,
  occurredAt,
  input,
  outcome,
  committed,
  rulesetVersion,
  supplemental
}: CreateCommittedTurnEventPayloadParams): CanonicalTurnEventPayload {
  return {
    schema_version: COMMITTED_EVENT_SCHEMA_VERSION,
    event_kind: "turn-resolution",
    event_id: eventId,
    player_id: playerId,
    occurred_at: occurredAt,
    attempt: {
      input
    },
    outcome,
    committed,
    contract_versions: {
      turn_output: TURN_OUTPUT_SCHEMA_VERSION,
      authoritative_state: AUTHORITATIVE_STATE_SCHEMA_VERSION,
      ruleset: rulesetVersion
    },
    ...(supplemental ? { supplemental } : {})
  };
}
