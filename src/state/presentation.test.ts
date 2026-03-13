import assert from "node:assert/strict";
import test from "node:test";
import type { AcceptedTurnConsequences, Player, TurnOutputPayload } from "../core/types.js";
import { reconcileTurnPresentation } from "./presentation.js";

function createOpeningSlicePlayer(): Player {
  return {
    id: "player-ghostlight",
    name: "Avery",
    created_at: "2026-03-13T00:00:00.000Z",
    location: "Rooftop Market",
    summary: "The relay keeps barking fake evacuation orders.",
    inventory: [],
    flags: [],
    quests: [
      {
        id: "ghostlight_relay",
        status: "active",
        summary: "Inspect the sparking market beacon in Rooftop Market"
      }
    ],
    director_state: {
      end_goal: "Quiet the Ghostlight Relay before it empties the district.",
      current_act_id: "act-1",
      current_act: "Market Rumors",
      current_beat_id: "beat-1",
      current_beat_label: "Confirm the relay is real",
      story_beats_remaining: 4,
      end_goal_progress: "No one has proved the relay is more than panic.",
      completed_beats: []
    }
  };
}

function createNoCommitProposal({
  narrative = "You pause in Rooftop Market and take stock. The clearest lead is still to confirm the relay is real.",
  location = "Rooftop Market"
}: {
  narrative?: string;
  location?: string;
} = {}): TurnOutputPayload {
  return {
    schema_version: "turn-output/v1",
    narrative,
    player_options: ["Look around", "Check your gear", "Consider the next move"],
    state_updates: {
      location,
      inventory_add: [],
      inventory_remove: [],
      flags_add: [],
      flags_remove: [],
      quests: []
    },
    director_updates: {
      end_goal_progress: "No one has proved the relay is more than panic."
    },
    memory_updates: []
  };
}

function createNoCommitConsequences(): AcceptedTurnConsequences {
  return {
    state_updates: null,
    director_updates: null,
    memory_updates: []
  };
}

test("reconcileTurnPresentation replaces repetitive opening-slice look fallback with grounded scene detail", () => {
  const player = createOpeningSlicePlayer();

  const reconciled = reconcileTurnPresentation({
    player,
    input: "look around",
    proposedTurnOutput: createNoCommitProposal(),
    acceptedConsequences: createNoCommitConsequences(),
    nextPlayer: player
  });

  assert.match(reconciled.narrative, /Rooftop Market/);
  assert.match(reconciled.narrative, /market beacon/i);
  assert.match(reconciled.narrative, /Nila Vale/);
  assert.match(reconciled.narrative, /stairwell|stairs/i);
  assert.ok(reconciled.player_options.includes("Inspect the market beacon"));
  assert.ok(reconciled.player_options.includes("Ask Nila Vale what she has seen"));
});

test("reconcileTurnPresentation replaces repetitive tell-me-more fallback with authored location detail", () => {
  const player = createOpeningSlicePlayer();

  const reconciled = reconcileTurnPresentation({
    player,
    input: "tell me more about the rooftop market",
    proposedTurnOutput: createNoCommitProposal(),
    acceptedConsequences: createNoCommitConsequences(),
    nextPlayer: player
  });

  assert.match(reconciled.narrative, /Rooftop Market/);
  assert.match(reconciled.narrative, /market beacon/i);
  assert.doesNotMatch(reconciled.narrative, /^You pause in Rooftop Market/i);
  assert.ok(reconciled.player_options.includes("Check the narrow stairwell"));
});

test("reconcileTurnPresentation turns blocked nearby travel loops into grounded route guidance", () => {
  const player = createOpeningSlicePlayer();

  const reconciled = reconcileTurnPresentation({
    player,
    input: "head for Stormglass Causeway",
    proposedTurnOutput: createNoCommitProposal(),
    acceptedConsequences: createNoCommitConsequences(),
    nextPlayer: player
  });

  assert.match(reconciled.narrative, /Stormglass Causeway/i);
  assert.match(reconciled.narrative, /Lantern Walk|stairwell/i);
  assert.doesNotMatch(reconciled.narrative, /You make it to Stormglass Causeway/i);
  assert.ok(reconciled.player_options.includes("Go down the stairs to Lantern Walk"));
});

test("reconcileTurnPresentation keeps the generic no-commit fallback outside authored opening-scene coverage", () => {
  const player = {
    ...createOpeningSlicePlayer(),
    location: "Relay Vault"
  };

  const reconciled = reconcileTurnPresentation({
    player,
    input: "look around",
    proposedTurnOutput: createNoCommitProposal({
      narrative: "You pause in Relay Vault and take stock, but nothing else changes yet.",
      location: "Relay Vault"
    }),
    acceptedConsequences: createNoCommitConsequences(),
    nextPlayer: player
  });

  assert.equal(reconciled.narrative, "You pause in Relay Vault and take stock, but nothing else changes yet.");
  assert.deepEqual(reconciled.player_options, ["Look around", "Check your gear", "Consider the next move"]);
});
