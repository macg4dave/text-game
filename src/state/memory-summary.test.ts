import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION,
  type CanonicalEventPayload,
  type DirectorSpec,
  type MemorySummaryArtifact,
  type Player
} from "../core/types.js";
import { createCommittedTurnEventPayload, createPlayerCreatedEventPayload } from "./committed-event.js";
import { buildMemorySummaryArtifactsFromCommittedEvents } from "./memory-summary.js";

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

function createDirectorSpec(): DirectorSpec {
  return {
    end_goal: "Reach the tower",
    acts: [
      {
        id: "act-1",
        name: "Arrival",
        beats: [
          {
            id: "beat-1",
            label: "Find the signal",
            unlock_flags: ["signal_seen"]
          },
          {
            id: "beat-2",
            label: "Cross the bridge",
            required_flags: ["signal_seen"]
          }
        ]
      }
    ]
  };
}

test("buildMemorySummaryArtifactsFromCommittedEvents reconstructs scene summaries and beat recaps from canonical events", () => {
  const player = createPlayer();
  const events: CanonicalEventPayload[] = [
    createPlayerCreatedEventPayload({
      eventId: "event-player-created",
      occurredAt: player.created_at,
      player: {
        schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
        ...player
      },
      supplemental: {
        presentation: {
          narrative: null,
          player_options: []
        }
      }
    }),
    createCommittedTurnEventPayload({
      eventId: "event-accepted",
      playerId: player.id,
      occurredAt: "2026-03-08T00:01:00.000Z",
      input: "cross toward the bridge",
      outcome: {
        status: "accepted",
        summary: "Accepted committed turn outcome: location=Sky Bridge; flags_add=signal_seen; memory_updates=1",
        rejection_reason: null
      },
      committed: {
        state_updates: {
          location: "Sky Bridge",
          inventory_add: ["bridge pass"],
          inventory_remove: ["signal shard"],
          flags_add: ["signal_seen"],
          flags_remove: ["market_seen"],
          quests: []
        },
        director_updates: {
          end_goal_progress: "You now have a clear route toward the tower."
        },
        memory_updates: ["The signal lantern revealed the bridge route."]
      }
    })
  ];

  const artifacts = buildMemorySummaryArtifactsFromCommittedEvents({ events, directorSpec: createDirectorSpec() });
  const sceneSummary = artifacts.find((artifact: MemorySummaryArtifact) => artifact.artifact_kind === "scene-summary");
  const beatRecap = artifacts.find((artifact: MemorySummaryArtifact) => artifact.artifact_kind === "beat-recap");

  assert.equal(artifacts.length, 2);
  assert.equal(sceneSummary?.schema_version, MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION);
  assert.equal(sceneSummary?.beat_id, "beat-1");
  assert.equal(sceneSummary?.location, "Sky Bridge");
  assert.deepEqual(sceneSummary?.detail_lines, ["The signal lantern revealed the bridge route."]);

  assert.equal(beatRecap?.schema_version, MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION);
  assert.equal(beatRecap?.beat_id, "beat-1");
  assert.match(beatRecap?.summary ?? "", /Find the signal/i);
  assert.deepEqual(beatRecap?.source_event_ids, ["event-accepted"]);
});
