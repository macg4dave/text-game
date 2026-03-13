import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { reloadDirectorSpec } from "../src/story/director.js";
import { closeDb, getDb, resetDb } from "../src/core/db.js";
import { createPlayerCreatedEventPayload, createCommittedTurnEventPayload } from "../src/state/committed-event.js";
import { addCommittedTurnEvent, getCommittedTurnEvents } from "../src/state/game.js";
import { replayCommittedTurnEvents } from "../src/state/replay.js";
import type { AuthoritativePlayerState, CanonicalEventCommittedChanges, Player, QuestUpdate } from "../src/core/types.js";

interface StorySampleWalkthroughFixture {
  fixture_id: string;
  description: string;
  player: Player;
  turns: Array<{
    input: string;
    occurred_at: string;
    outcome_summary: string;
    committed: CanonicalEventCommittedChanges;
  }>;
  expected_final_state: {
    location: string;
    inventory: string[];
    flags: string[];
    quests: QuestUpdate[];
    director_state: {
      current_act_id: string;
      current_beat_id: string;
      story_beats_remaining: number;
      completed_beats: string[];
    };
    end_goal_progress: string;
  };
}

const FIXTURE_PATH = path.resolve(process.cwd(), "data", "story_sample_walkthrough.json");

function loadFixture(): StorySampleWalkthroughFixture {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as StorySampleWalkthroughFixture;
}

function seedPlayerRow(player: Player): void {
  getDb()
    .prepare(
      `INSERT INTO players (id, name, created_at, location, summary, director_state, inventory, flags, quests)
       VALUES (@id, @name, @created_at, @location, @summary, @director_state, @inventory, @flags, @quests)`
    )
    .run({
      id: player.id,
      name: player.name,
      created_at: player.created_at,
      location: player.location,
      summary: player.summary,
      director_state: JSON.stringify(player.director_state),
      inventory: JSON.stringify(player.inventory),
      flags: JSON.stringify(player.flags),
      quests: JSON.stringify(player.quests)
    });
}

function main(): void {
  const fixture = loadFixture();
  resetDb();
  reloadDirectorSpec();
  seedPlayerRow(fixture.player);

  const createdPlayer: AuthoritativePlayerState = {
    schema_version: "authoritative-state/v1",
    ...fixture.player
  };

  addCommittedTurnEvent(
    createPlayerCreatedEventPayload({
      eventId: `${fixture.fixture_id}-player-created`,
      occurredAt: fixture.player.created_at,
      player: createdPlayer,
      supplemental: {
        presentation: {
          narrative: null,
          player_options: []
        }
      }
    })
  );

  fixture.turns.forEach((turn, index) => {
    addCommittedTurnEvent(
      createCommittedTurnEventPayload({
        eventId: `${fixture.fixture_id}-turn-${index + 1}`,
        playerId: fixture.player.id,
        occurredAt: turn.occurred_at,
        input: turn.input,
        outcome: {
          status: "accepted",
          summary: turn.outcome_summary,
          rejection_reason: null
        },
        committed: turn.committed,
        supplemental: {
          transcript: {
            player_text: turn.input,
            narrator_text: null
          },
          presentation: {
            narrative: null,
            player_options: []
          }
        }
      })
    );
  });

  const events = getCommittedTurnEvents(fixture.player.id);
  const replayed = replayCommittedTurnEvents({ events });

  assert.equal(events.length, fixture.turns.length + 1, "expected player-created plus walkthrough turns");
  assert.equal(replayed.location, fixture.expected_final_state.location);
  assert.deepEqual(replayed.inventory, fixture.expected_final_state.inventory);
  assert.deepEqual(replayed.flags, fixture.expected_final_state.flags);
  assert.deepEqual(replayed.quests, fixture.expected_final_state.quests);
  assert.equal(replayed.director_state.current_act_id, fixture.expected_final_state.director_state.current_act_id);
  assert.equal(replayed.director_state.current_beat_id, fixture.expected_final_state.director_state.current_beat_id);
  assert.equal(replayed.director_state.story_beats_remaining, fixture.expected_final_state.director_state.story_beats_remaining);
  assert.deepEqual(replayed.director_state.completed_beats, fixture.expected_final_state.director_state.completed_beats);
  assert.equal(replayed.director_state.end_goal_progress, fixture.expected_final_state.end_goal_progress);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        fixtureId: fixture.fixture_id,
        turns: fixture.turns.length,
        finalLocation: replayed.location,
        finalFlags: replayed.flags,
        finalQuestStatus: replayed.quests.map((quest) => ({ id: quest.id, status: quest.status })),
        finalBeat: replayed.director_state.current_beat_id,
        endGoalProgress: replayed.director_state.end_goal_progress
      },
      null,
      2
    ) + "\n"
  );
}

try {
  main();
} finally {
  closeDb();
}