import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type Player
} from "../core/types.js";
import { createCommittedTurnEventPayload } from "../server/http-contract.js";

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "text-game-replay-test-"));
process.env.GAME_DB_PATH = path.join(tempDirectory, "game.db");

const dbModule = await import("../core/db.js");
const gameModule = await import("./game.js");
const replayModule = await import("./replay.js");
const committedEventModule = await import("./committed-event.js");

const storySampleFixture = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "data", "story_sample_walkthrough.json"), "utf8")
) as {
  fixture_id: string;
  player: Player;
  turns: Array<{
    input: string;
    occurred_at: string;
    outcome_summary: string;
    committed: Parameters<typeof committedEventModule.createCommittedTurnEventPayload>[0]["committed"];
  }>;
  expected_final_state: {
    location: string;
    inventory: string[];
    flags: string[];
    quests: Player["quests"];
    director_state: {
      current_act_id: string;
      current_beat_id: string;
      story_beats_remaining: number;
      completed_beats: string[];
    };
    end_goal_progress: string;
  };
};

function seedPlayerRow(player: Player): void {
  dbModule
    .getDb()
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

test("canonical committed events persist separately from transcript rows and replay final state deterministically", () => {
  dbModule.resetDb();

  const player = createPlayer();
  seedPlayerRow(player);
  gameModule.addCommittedTurnEvent(
    committedEventModule.createPlayerCreatedEventPayload({
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
    })
  );

  gameModule.addEvent(player.id, "player", "touch the lantern");
  gameModule.addEvent(player.id, "narrator", "The signal lantern hummed when touched.");

  const acceptedEvent = createCommittedTurnEventPayload({
    eventId: "event-accepted",
    playerId: player.id,
    occurredAt: "2026-03-08T00:00:00.000Z",
    input: "touch the lantern",
    outcome: {
      status: "accepted",
      summary: "The player inspected the lantern and revealed the signal.",
      rejection_reason: null
    },
    committed: {
      state_updates: {
        location: "Sky Bridge",
        inventory_add: ["bridge pass"],
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
    },
    rulesetVersion: "story-rules/v1",
    supplemental: {
      transcript: {
        player_text: "touch the lantern",
        narrator_text: "The signal lantern hummed when touched."
      },
      presentation: {
        narrative: "The signal lantern hummed when touched.",
        player_options: ["Cross the bridge"]
      },
      prompt: {
        model: "game-chat"
      }
    }
  });

  const rejectedEvent = createCommittedTurnEventPayload({
    eventId: "event-rejected",
    playerId: player.id,
    occurredAt: "2026-03-08T00:00:01.000Z",
    input: "jump to the tower",
    outcome: {
      status: "rejected",
      summary: "The attempted leap was rejected before commit.",
      rejection_reason: "state_update_validation"
    },
    committed: {
      state_updates: null,
      director_updates: null,
      memory_updates: []
    },
    rulesetVersion: "story-rules/v1",
    supplemental: {
      transcript: {
        player_text: "jump to the tower",
        narrator_text: null
      },
      presentation: {
        narrative: null,
        player_options: []
      }
    }
  });

  gameModule.addCommittedTurnEvent(acceptedEvent);
  gameModule.addCommittedTurnEvent(rejectedEvent);

  const transcript = gameModule.getShortHistory(player.id, 6);
  const committedEvents = gameModule.getCommittedTurnEvents(player.id);
  const replayedPlayer = replayModule.replayCommittedTurnEvents({ events: committedEvents });
  const playerCreatedEvent = committedEvents.find((event) => event.event_kind === "player-created");
  const acceptedTurnEvent = committedEvents.find(
    (event) => event.event_kind === "turn-resolution" && event.outcome.status === "accepted"
  );

  assert.deepEqual(transcript, ["PLAYER: touch the lantern", "NARRATOR: The signal lantern hummed when touched."]);
  assert.equal(committedEvents.length, 3);
  assert.equal(playerCreatedEvent?.schema_version, "committed-event/v1");
  assert.equal(playerCreatedEvent?.event_kind, "player-created");
  assert.equal(acceptedTurnEvent?.contract_versions.turn_output, TURN_OUTPUT_SCHEMA_VERSION);
  assert.equal(acceptedTurnEvent?.contract_versions.authoritative_state, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.equal(replayedPlayer.location, "Sky Bridge");
  assert.deepEqual(replayedPlayer.inventory, ["bridge pass"]);
  assert.deepEqual(replayedPlayer.flags, ["signal_seen"]);
  assert.equal(replayedPlayer.quests[0]?.status, "complete");
  assert.equal(replayedPlayer.director_state.end_goal_progress, "You now have a clear route toward the tower.");
});

test("replay requires a canonical player-created event before applying committed turn deltas", () => {
  const turnOnlyEvents = [
    createCommittedTurnEventPayload({
      eventId: "event-accepted",
      playerId: "player-123",
      occurredAt: "2026-03-08T00:00:00.000Z",
      input: "touch the lantern",
      outcome: {
        status: "accepted",
        summary: "Accepted committed turn outcome.",
        rejection_reason: null
      },
      committed: {
        state_updates: {
          location: "Sky Bridge",
          inventory_add: ["bridge pass"],
          inventory_remove: [],
          flags_add: [],
          flags_remove: [],
          quests: []
        },
        director_updates: null,
        memory_updates: []
      }
    })
  ];

  assert.throws(
    () => replayModule.replayCommittedTurnEvents({ events: turnOnlyEvents }),
    /Replay requires a canonical player-created event/
  );
});

test("story_sample walkthrough fixture replays to the canonical Ghostlight Relay ending", () => {
  dbModule.resetDb();
  seedPlayerRow(storySampleFixture.player);

  gameModule.addCommittedTurnEvent(
    committedEventModule.createPlayerCreatedEventPayload({
      eventId: `${storySampleFixture.fixture_id}-player-created`,
      occurredAt: storySampleFixture.player.created_at,
      player: {
        schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
        ...storySampleFixture.player
      },
      supplemental: {
        presentation: {
          narrative: null,
          player_options: []
        }
      }
    })
  );

  storySampleFixture.turns.forEach((turn, index) => {
    gameModule.addCommittedTurnEvent(
      committedEventModule.createCommittedTurnEventPayload({
        eventId: `${storySampleFixture.fixture_id}-turn-${index + 1}`,
        playerId: storySampleFixture.player.id,
        occurredAt: turn.occurred_at,
        input: turn.input,
        outcome: {
          status: "accepted",
          summary: turn.outcome_summary,
          rejection_reason: null
        },
        committed: turn.committed,
        rulesetVersion: "story-rules/v1"
      })
    );
  });

  const replayed = replayModule.replayCommittedTurnEvents({
    events: gameModule.getCommittedTurnEvents(storySampleFixture.player.id)
  });

  assert.equal(replayed.location, storySampleFixture.expected_final_state.location);
  assert.deepEqual(replayed.inventory, storySampleFixture.expected_final_state.inventory);
  assert.deepEqual(replayed.flags, storySampleFixture.expected_final_state.flags);
  assert.deepEqual(replayed.quests, storySampleFixture.expected_final_state.quests);
  assert.equal(replayed.director_state.current_act_id, storySampleFixture.expected_final_state.director_state.current_act_id);
  assert.equal(replayed.director_state.current_beat_id, storySampleFixture.expected_final_state.director_state.current_beat_id);
  assert.equal(replayed.director_state.story_beats_remaining, storySampleFixture.expected_final_state.director_state.story_beats_remaining);
  assert.deepEqual(replayed.director_state.completed_beats, storySampleFixture.expected_final_state.director_state.completed_beats);
  assert.equal(replayed.director_state.end_goal_progress, storySampleFixture.expected_final_state.end_goal_progress);
});

test.after(() => {
  dbModule.closeDb();
  rmSync(tempDirectory, { recursive: true, force: true });
});
