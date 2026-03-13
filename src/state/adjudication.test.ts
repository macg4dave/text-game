import assert from "node:assert/strict";
import test from "node:test";
import type { DirectorSpec, Player, QuestSpec, TurnOutputPayload } from "../core/types.js";
import { adjudicateTurnOutput } from "./adjudication.js";

function createPlayer(): Player {
  return {
    id: "player-ghostlight",
    name: "Avery",
    created_at: "2026-03-13T00:00:00.000Z",
    location: "Rooftop Market",
    summary: "A beacon has started spitting false evacuation orders across the market.",
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

function createDirectorSpec(): DirectorSpec {
  return {
    end_goal: "Quiet the Ghostlight Relay before it empties the district.",
    acts: [
      {
        id: "act-1",
        name: "Market Rumors",
        beats: [
          {
            id: "beat-1",
            label: "Confirm the relay is real",
            unlock_flags: ["beacon_inspected"]
          },
          {
            id: "beat-2",
            label: "Find the way into the relay route",
            required_flags: ["beacon_inspected"],
            unlock_flags: ["nila_guidance"]
          }
        ]
      }
    ]
  };
}

function createQuestSpec(): QuestSpec {
  return {
    quests: [
      {
        id: "ghostlight_relay",
        title: "Quiet the Ghostlight Relay",
        stages: [
          {
            id: "stage-1",
            label: "Inspect the sparking market beacon in Rooftop Market",
            unlock_flags: ["beacon_inspected"]
          },
          {
            id: "stage-2",
            label: "Ask Nila Vale where the relay draws power",
            required_flags: ["beacon_inspected"],
            unlock_flags: ["nila_guidance"]
          }
        ]
      }
    ]
  };
}

test("adjudicateTurnOutput derives quest progress from accepted flags instead of trusting proposed completion", () => {
  const player = createPlayer();
  const turnOutput: TurnOutputPayload = {
    schema_version: "turn-output/v1",
    narrative: "You claim the whole relay crisis is solved on the spot.",
    player_options: ["Leave triumphantly"],
    state_updates: {
      location: "Rooftop Market",
      inventory_add: [],
      inventory_remove: [],
      flags_add: ["beacon_inspected"],
      flags_remove: [],
      quests: [
        {
          id: "ghostlight_relay",
          status: "complete",
          summary: "Everything is already fixed."
        }
      ]
    },
    director_updates: {
      end_goal_progress: "The relay is definitely handled now."
    },
    memory_updates: ["The player somehow solved everything immediately."]
  };

  const adjudicated = adjudicateTurnOutput({
    player,
    turnOutput,
    directorSpec: createDirectorSpec(),
    questSpec: createQuestSpec()
  });

  assert.deepEqual(adjudicated.acceptedConsequences.state_updates?.quests, [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Ask Nila Vale where the relay draws power"
    }
  ]);
});

test("adjudicateTurnOutput keeps authored progression flags sticky so later objectives do not regress", () => {
  const player: Player = {
    ...createPlayer(),
    flags: ["beacon_inspected", "nila_guidance"],
    quests: [
      {
        id: "ghostlight_relay",
        status: "active",
        summary: "Recover the tuning fork from the Closed Stacks"
      }
    ]
  };

  const turnOutput: TurnOutputPayload = {
    schema_version: "turn-output/v1",
    narrative: "You grab the tuning fork and somehow forget every clue that got you here.",
    player_options: ["Keep moving"],
    state_updates: {
      location: "Closed Stacks",
      inventory_add: ["tuning_fork"],
      inventory_remove: [],
      flags_add: ["tuning_fork_taken"],
      flags_remove: ["beacon_inspected", "nila_guidance"],
      quests: []
    },
    director_updates: {
      end_goal_progress: "Next step: Carry the tuning fork across Stormglass Causeway."
    },
    memory_updates: []
  };

  const adjudicated = adjudicateTurnOutput({
    player,
    turnOutput,
    directorSpec: createDirectorSpec(),
    questSpec: {
      quests: [
        {
          id: "ghostlight_relay",
          title: "Quiet the Ghostlight Relay",
          stages: [
            {
              id: "stage-1",
              label: "Inspect the sparking market beacon in Rooftop Market",
              unlock_flags: ["beacon_inspected"]
            },
            {
              id: "stage-2",
              label: "Ask Nila Vale where the relay draws power",
              required_flags: ["beacon_inspected"],
              unlock_flags: ["nila_guidance"]
            },
            {
              id: "stage-3",
              label: "Recover the tuning fork from the Closed Stacks",
              required_flags: ["nila_guidance"],
              unlock_flags: ["tuning_fork_taken"]
            },
            {
              id: "stage-4",
              label: "Carry the tuning fork through Stormglass Causeway",
              required_flags: ["tuning_fork_taken"],
              unlock_flags: ["causeway_crossed"]
            }
          ]
        }
      ]
    }
  });

  assert.deepEqual(adjudicated.acceptedConsequences.state_updates?.flags_remove, []);
  assert.deepEqual(adjudicated.acceptedConsequences.state_updates?.quests, [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Carry the tuning fork through Stormglass Causeway"
    }
  ]);
});