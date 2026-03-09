import crypto from "node:crypto";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  COMMITTED_EVENT_SCHEMA_VERSION,
  DEFAULT_RULESET_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type AuthoritativePlayerState,
  type CanonicalEventCommittedChanges,
  type CanonicalEventOutcome,
  type CanonicalPlayerCreatedEventPayload,
  type CanonicalEventSupplemental,
  type CanonicalTurnEventPayload
} from "../core/types.js";

export interface CreateCommittedTurnEventPayloadParams {
  eventId?: string;
  playerId: string;
  occurredAt?: string;
  input: string;
  outcome: CanonicalEventOutcome;
  committed: CanonicalEventCommittedChanges;
  rulesetVersion?: string;
  supplemental?: CanonicalEventSupplemental;
}

export function createCommittedTurnEventPayload({
  eventId = crypto.randomUUID(),
  playerId,
  occurredAt = new Date().toISOString(),
  input,
  outcome,
  committed,
  rulesetVersion = DEFAULT_RULESET_VERSION,
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

export interface CreatePlayerCreatedEventPayloadParams {
  eventId?: string;
  occurredAt?: string;
  player: AuthoritativePlayerState;
  rulesetVersion?: string;
  supplemental?: CanonicalEventSupplemental;
}

export function createPlayerCreatedEventPayload({
  eventId = crypto.randomUUID(),
  occurredAt = new Date().toISOString(),
  player,
  rulesetVersion = DEFAULT_RULESET_VERSION,
  supplemental
}: CreatePlayerCreatedEventPayloadParams): CanonicalPlayerCreatedEventPayload {
  return {
    schema_version: COMMITTED_EVENT_SCHEMA_VERSION,
    event_kind: "player-created",
    event_id: eventId,
    player_id: player.id,
    occurred_at: occurredAt,
    created_player: player,
    contract_versions: {
      turn_output: TURN_OUTPUT_SCHEMA_VERSION,
      authoritative_state: AUTHORITATIVE_STATE_SCHEMA_VERSION,
      ruleset: rulesetVersion
    },
    ...(supplemental ? { supplemental } : {})
  };
}

export function summarizeAcceptedTurnOutcome(committed: CanonicalEventCommittedChanges): string {
  const parts: string[] = [];
  const stateUpdates = committed.state_updates;
  if (stateUpdates?.location) {
    parts.push(`location=${stateUpdates.location}`);
  }
  if (stateUpdates?.inventory_add.length) {
    parts.push(`inventory_add=${stateUpdates.inventory_add.join(",")}`);
  }
  if (stateUpdates?.inventory_remove.length) {
    parts.push(`inventory_remove=${stateUpdates.inventory_remove.join(",")}`);
  }
  if (stateUpdates?.flags_add.length) {
    parts.push(`flags_add=${stateUpdates.flags_add.join(",")}`);
  }
  if (stateUpdates?.flags_remove.length) {
    parts.push(`flags_remove=${stateUpdates.flags_remove.join(",")}`);
  }
  if (stateUpdates?.quests.length) {
    parts.push(`quests=${stateUpdates.quests.map((quest) => `${quest.id}:${quest.status}`).join(",")}`);
  }
  if (committed.director_updates?.end_goal_progress) {
    parts.push(`director_progress=${committed.director_updates.end_goal_progress}`);
  }
  if (committed.memory_updates.length) {
    parts.push(`memory_updates=${committed.memory_updates.length}`);
  }

  return parts.length ? `Accepted committed turn outcome: ${parts.join("; ")}` : "Accepted committed turn outcome.";
}

export function summarizeRejectedTurnOutcome(reason: string): string {
  return `Rejected turn outcome before commit: ${reason}.`;
}
