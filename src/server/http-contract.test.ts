import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMITTED_EVENT_SCHEMA_VERSION,
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalTurnEventPayload,
  type Player,
  type TurnOutputPayload
} from "../core/types.js";
import { validateCanonicalTurnEvent, validateStateResponse, validateTurnResponse } from "../rules/validator.js";
import {
  createAuthoritativePlayerState,
  createCommittedTurnEventPayload,
  createPlayerCreatedEventPayload,
  createStateResponsePayload,
  createTurnResponsePayload
} from "./http-contract.js";

function createPlayer(): Player {
  return {
    id: "player-123",
    name: "Avery",
    created_at: "2026-03-08T00:00:00.000Z",
    location: "Rooftop Market",
    summary: "You arrived at the market.",
    inventory: ["signal shard"],
    flags: ["market_seen"],
    quests: [
      {
        id: "intro-signal",
        status: "active",
        summary: "You noticed the first signal marker."
      }
    ],
    director_state: {
      end_goal: "Reach the tower",
      current_act_id: "act-1",
      current_act: "Arrival",
      current_beat_id: "beat-1",
      current_beat_label: "Find the signal",
      story_beats_remaining: 3,
      end_goal_progress: "You have started the search.",
      completed_beats: []
    }
  };
}

function createTurnOutput(): TurnOutputPayload {
  return {
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "You scan the market from the rooftop.",
    player_options: ["Inspect the signal lantern", "Leave quietly"],
    state_updates: {
      location: "Rooftop Market",
      inventory_add: ["signal shard"],
      inventory_remove: [],
      flags_add: ["market_seen"],
      flags_remove: [],
      quests: [
        {
          id: "intro-signal",
          status: "active",
          summary: "You noticed the first signal marker."
        }
      ]
    },
    director_updates: {
      end_goal_progress: "The signal is now visible."
    },
    memory_updates: ["The player found a signal shard in the market."]
  };
}

test("createAuthoritativePlayerState stamps the authoritative schema version", () => {
  const authoritativePlayer = createAuthoritativePlayerState(createPlayer());

  assert.equal(authoritativePlayer.schema_version, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.deepEqual(validateStateResponse(createStateResponsePayload(authoritativePlayer)), { ok: true, errors: [] });
});

test("createTurnResponsePayload preserves the full validated turn output alongside the authoritative player", () => {
  const authoritativePlayer = createAuthoritativePlayerState(createPlayer());
  const response = createTurnResponsePayload(createTurnOutput(), authoritativePlayer);

  assert.deepEqual(response.memory_updates, ["The player found a signal shard in the market."]);
  assert.equal(response.player.schema_version, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.deepEqual(validateTurnResponse(response), { ok: true, errors: [] });
});

test("createTurnResponsePayload keeps proposal fields separate from the authoritative player snapshot", () => {
  const authoritativePlayer = createAuthoritativePlayerState(createPlayer());
  const response = createTurnResponsePayload(
    {
      ...createTurnOutput(),
      state_updates: {
        ...createTurnOutput().state_updates,
        location: "Sky Bridge"
      }
    },
    authoritativePlayer
  );

  assert.equal(response.state_updates.location, "Sky Bridge");
  assert.equal(response.player.location, "Rooftop Market");
  assert.deepEqual(validateTurnResponse(response), { ok: true, errors: [] });
});

test("createCommittedTurnEventPayload separates replay-critical semantics from supplementary transcript fields", () => {
  const authoritativePlayer = createAuthoritativePlayerState(createPlayer());
  const turnOutput = createTurnOutput();
  const payload = createCommittedTurnEventPayload({
    eventId: "event-123",
    playerId: authoritativePlayer.id,
    occurredAt: "2026-03-08T00:00:00.000Z",
    input: "touch the lantern",
    outcome: {
      status: "accepted",
      summary: "The player inspected the lantern and revealed the signal.",
      rejection_reason: null
    },
    committed: {
      state_updates: turnOutput.state_updates,
      director_updates: turnOutput.director_updates,
      memory_updates: turnOutput.memory_updates
    },
    rulesetVersion: "story-rules/v1",
    supplemental: {
      transcript: {
        player_text: "touch the lantern",
        narrator_text: turnOutput.narrative
      },
      presentation: {
        narrative: turnOutput.narrative,
        player_options: turnOutput.player_options
      },
      prompt: {
        model: "game-chat"
      }
    }
  });

  assert.equal(payload.schema_version, COMMITTED_EVENT_SCHEMA_VERSION);
  assert.equal(payload.contract_versions.turn_output, TURN_OUTPUT_SCHEMA_VERSION);
  assert.equal(payload.contract_versions.authoritative_state, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.deepEqual(payload.committed.state_updates, turnOutput.state_updates);
  assert.deepEqual(payload.supplemental?.presentation?.player_options, turnOutput.player_options);
  assert.deepEqual(validateCanonicalTurnEvent(payload), { ok: true, errors: [] });
});

test("createPlayerCreatedEventPayload stamps a canonical bootstrap event for replay", () => {
  const authoritativePlayer = createAuthoritativePlayerState(createPlayer());
  const payload = createPlayerCreatedEventPayload({
    eventId: "event-created",
    occurredAt: "2026-03-08T00:00:00.000Z",
    player: authoritativePlayer,
    rulesetVersion: "story-rules/v1"
  });

  assert.equal(payload.event_kind, "player-created");
  assert.equal(payload.player_id, authoritativePlayer.id);
  assert.equal(payload.created_player.schema_version, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.deepEqual(validateCanonicalTurnEvent(payload), { ok: true, errors: [] });
});
