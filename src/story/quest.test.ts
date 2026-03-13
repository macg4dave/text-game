import assert from "node:assert/strict";
import test from "node:test";
import type { QuestSpec, QuestUpdate } from "../core/types.js";
import {
  inferQuestStageLocation,
  listReachableQuestLocations,
  resolveQuestUpdates
} from "./quest.js";

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
          },
          {
            id: "stage-3",
            label: "Carry the tuning fork through Stormglass Causeway",
            required_flags: ["nila_guidance"],
            unlock_flags: ["causeway_crossed"]
          },
          {
            id: "stage-4",
            label: "Resolve the relay in the vault",
            required_flags: ["causeway_crossed"],
            unlock_flags: ["relay_disabled", "relay_retuned"]
          }
        ]
      }
    ]
  };
}

test("resolveQuestUpdates starts the authored story_sample objective when no progress exists yet", () => {
  assert.deepEqual(
    resolveQuestUpdates({
      questSpec: createQuestSpec(),
      existingQuests: [],
      flags: []
    }),
    [
      {
        id: "ghostlight_relay",
        status: "active",
        summary: "Inspect the sparking market beacon in Rooftop Market"
      }
    ]
  );
});

test("resolveQuestUpdates advances to the next objective after accepted progression flags", () => {
  const existingQuests: QuestUpdate[] = [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Inspect the sparking market beacon in Rooftop Market"
    }
  ];

  assert.deepEqual(
    resolveQuestUpdates({
      questSpec: createQuestSpec(),
      existingQuests,
      flags: ["beacon_inspected"]
    }),
    [
      {
        id: "ghostlight_relay",
        status: "active",
        summary: "Ask Nila Vale where the relay draws power"
      }
    ]
  );
});

test("resolveQuestUpdates preserves existing quest copy when no new progression has been earned", () => {
  const existingQuests: QuestUpdate[] = [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Nila still owes you the next route."
    }
  ];

  assert.deepEqual(
    resolveQuestUpdates({
      questSpec: createQuestSpec(),
      existingQuests,
      flags: []
    }),
    existingQuests
  );
});

test("resolveQuestUpdates supports the compromise ending as a server-committed completion", () => {
  const existingQuests: QuestUpdate[] = [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Resolve the relay in the vault"
    }
  ];

  assert.deepEqual(
    resolveQuestUpdates({
      questSpec: createQuestSpec(),
      existingQuests,
      flags: ["beacon_inspected", "nila_guidance", "causeway_crossed", "relay_retuned"]
    }),
    [
      {
        id: "ghostlight_relay",
        status: "complete",
        summary: "Resolve the relay in the vault"
      }
    ]
  );
});

test("inferQuestStageLocation extracts authored location hints from quest-stage labels", () => {
  assert.equal(
    inferQuestStageLocation({ label: "Recover the tuning fork from the Closed Stacks" }),
    "Closed Stacks"
  );
  assert.equal(
    inferQuestStageLocation({ label: "Carry the tuning fork through Stormglass Causeway" }),
    "Stormglass Causeway"
  );
  assert.equal(
    inferQuestStageLocation({ label: "Use the tuning fork to open the Relay Vault" }),
    "Relay Vault"
  );
  assert.equal(inferQuestStageLocation({ label: "Ask Nila Vale where the relay draws power" }), null);
});

test("listReachableQuestLocations follows authored prerequisites instead of current beat order", () => {
  assert.deepEqual(listReachableQuestLocations(createQuestSpec(), []), ["Rooftop Market"]);
  assert.deepEqual(listReachableQuestLocations(createQuestSpec(), ["beacon_inspected"]), ["Rooftop Market"]);
  assert.deepEqual(listReachableQuestLocations(createQuestSpec(), ["beacon_inspected", "nila_guidance"]), [
    "Rooftop Market",
    "Stormglass Causeway"
  ]);
  assert.deepEqual(listReachableQuestLocations(createQuestSpec(), ["beacon_inspected", "nila_guidance", "causeway_crossed"]), [
    "Rooftop Market",
    "Stormglass Causeway"
  ]);
});