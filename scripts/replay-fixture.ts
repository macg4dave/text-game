import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TURN_OUTPUT_SCHEMA_VERSION, type Player } from "../src/core/types.js";
import { createCommittedTurnEventPayload } from "../src/state/committed-event.js";

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

async function main(): Promise<void> {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "text-game-replay-fixture-"));
  process.env.GAME_DB_PATH = path.join(tempDirectory, "game.db");

  const dbModule = await import("../src/core/db.js");
  const gameModule = await import("../src/state/game.js");
  const replayModule = await import("../src/state/replay.js");

  try {
    dbModule.resetDb();
    const player = createPlayer();
    gameModule.getOrCreatePlayer({ playerId: player.id, name: player.name });

    gameModule.addEvent(player.id, "player", "touch the lantern");
    gameModule.addEvent(player.id, "narrator", "The signal lantern hummed when touched.");

    gameModule.addCommittedTurnEvent(
      createCommittedTurnEventPayload({
        eventId: "event-accepted",
        playerId: player.id,
        occurredAt: "2026-03-08T00:00:00.000Z",
        input: "touch the lantern",
        outcome: {
          status: "accepted",
          summary: "Accepted committed turn outcome: location=Sky Bridge; inventory_add=bridge pass; inventory_remove=signal shard; flags_add=signal_seen; flags_remove=market_seen; quests=intro-signal:complete; director_progress=You now have a clear route toward the tower.; memory_updates=1",
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
            model: "game-chat",
            schema_version: TURN_OUTPUT_SCHEMA_VERSION
          }
        }
      })
    );

    const committedEvents = gameModule.getCommittedTurnEvents(player.id);
    const replayedPlayer = replayModule.replayCommittedTurnEvents({ events: committedEvents });
    const playerCreatedEvent = committedEvents.find((event) => event.event_kind === "player-created");

    assert.equal(committedEvents.length, 2);
    assert.equal(playerCreatedEvent?.event_kind, "player-created");
    assert.equal(replayedPlayer.location, "Sky Bridge");
    assert.deepEqual(replayedPlayer.inventory, ["bridge pass"]);
    assert.deepEqual(replayedPlayer.flags, ["signal_seen"]);
    assert.equal(replayedPlayer.quests[0]?.status, "complete");
    assert.equal(replayedPlayer.director_state.end_goal_progress, "You now have a clear route toward the tower.");

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          replayedPlayer
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    dbModule.closeDb();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
