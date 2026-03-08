import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
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
  return {
    ...turnOutput,
    player
  };
}
