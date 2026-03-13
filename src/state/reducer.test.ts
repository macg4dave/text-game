import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  type CanonicalEventCommittedChanges,
  type DirectorState,
  type Player
} from "../core/types.js";
import { reduceCommittedPlayerState } from "./reducer.js";

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

function createAcceptedConsequences(): CanonicalEventCommittedChanges {
  return {
    state_updates: {
      location: "Sky Bridge",
      inventory_add: ["bridge pass", "signal shard"],
      inventory_remove: ["signal shard"],
      flags_add: ["signal_seen"],
      flags_remove: ["market_seen"],
      quests: [
        {
          id: "intro-signal",
          status: "complete",
          summary: "You crossed the bridge."
        }
      ]
    },
    director_updates: {
      end_goal_progress: "You now have a clear route toward the tower."
    },
    memory_updates: ["The signal lantern revealed the bridge route."]
  };
}

function createResolvedDirectorState(player: Player): DirectorState {
  return {
    ...player.director_state,
    current_beat_id: "beat-2",
    current_beat_label: "Reach the tower gate",
    story_beats_remaining: 2,
    end_goal_progress: "You now have a clear route toward the tower.",
    completed_beats: ["beat-1"]
  };
}

test("reduceCommittedPlayerState deterministically applies accepted consequences and returns an authoritative snapshot", () => {
  const player = createPlayer();
  const acceptedConsequences = createAcceptedConsequences();
  const resolvedDirectorState = createResolvedDirectorState(player);

  const reduced = reduceCommittedPlayerState({
    player,
    acceptedConsequences,
    resolvedDirectorState
  });

  assert.equal(reduced.changed, true);
  assert.notEqual(reduced.player, player);
  assert.notEqual(reduced.player.inventory, player.inventory);
  assert.notEqual(reduced.player.flags, player.flags);
  assert.notEqual(reduced.player.quests, player.quests);
  assert.deepEqual(reduced.player.inventory, ["bridge pass"]);
  assert.deepEqual(reduced.player.flags, ["signal_seen"]);
  assert.equal(reduced.player.location, "Sky Bridge");
  assert.deepEqual(reduced.player.quests, [
    {
      id: "intro-signal",
      status: "complete",
      summary: "You crossed the bridge."
    }
  ]);
  assert.equal(reduced.player.summary, "You arrived at the market.");
  assert.deepEqual(reduced.player.director_state, resolvedDirectorState);
  assert.equal(reduced.authoritativePlayer.schema_version, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.equal(reduced.authoritativePlayer.location, "Sky Bridge");
  assert.deepEqual(reduced.authoritativePlayer.director_state, resolvedDirectorState);
  assert.deepEqual(player.inventory, ["signal shard"]);
  assert.deepEqual(player.flags, ["market_seen"]);
  assert.equal(player.location, "Rooftop Market");
});

test("reduceCommittedPlayerState keeps rejected consequences as a deterministic no-op", () => {
  const player = createPlayer();

  const reduced = reduceCommittedPlayerState({
    player,
    acceptedConsequences: {
      state_updates: null,
      director_updates: null,
      memory_updates: []
    }
  });

  assert.equal(reduced.changed, false);
  assert.notEqual(reduced.player, player);
  assert.notEqual(reduced.player.inventory, player.inventory);
  assert.notEqual(reduced.player.flags, player.flags);
  assert.notEqual(reduced.player.quests, player.quests);
  assert.deepEqual(reduced.player, player);
  assert.equal(reduced.authoritativePlayer.schema_version, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.deepEqual(reduced.authoritativePlayer.inventory, player.inventory);
});

test("reduceCommittedPlayerState falls back to committed director progress when no resolved director state is provided", () => {
  const player = createPlayer();
  const acceptedConsequences = createAcceptedConsequences();

  const reduced = reduceCommittedPlayerState({
    player,
    acceptedConsequences
  });

  assert.equal(
    reduced.player.director_state.end_goal_progress,
    "You now have a clear route toward the tower."
  );
  assert.equal(reduced.player.director_state.current_beat_id, player.director_state.current_beat_id);
  assert.deepEqual(reduced.player.director_state.completed_beats, player.director_state.completed_beats);
});

test("reduceCommittedPlayerState keeps distinctive world-fact memory in the hot summary", () => {
  const player = createPlayer();

  const reduced = reduceCommittedPlayerState({
    player,
    acceptedConsequences: {
      state_updates: {
        location: "Rooftop Market",
        inventory_add: [],
        inventory_remove: [],
        flags_add: ["beacon_inspected"],
        flags_remove: [],
        quests: [
          {
            id: "intro-signal",
            status: "active",
            summary: "Ask Nila Vale where the relay draws power"
          }
        ]
      },
      director_updates: {
        end_goal_progress: "Next step: Ask Nila Vale where the relay draws power."
      },
      memory_updates: ["The market beacon is broadcasting false evacuation orders tied to the Ghostlight Relay."]
    }
  });

  assert.equal(
    reduced.player.summary,
    "You arrived at the market.\nThe market beacon is broadcasting false evacuation orders tied to the Ghostlight Relay."
  );
});
