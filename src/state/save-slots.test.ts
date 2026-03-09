import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import test from "node:test";

const tempDirectory = mkdtempSync(`${os.tmpdir().replace(/[\\/]?$/, `${pathSeparator()}`)}text-game-save-slots-test-`);
process.env.GAME_DB_PATH = `${tempDirectory}${pathSeparator()}game.db`;

const dbModule = await import("../core/db.js");
const gameModule = await import("./game.js");
const saveSlotsModule = await import("./save-slots.js");
const httpContractModule = await import("../server/http-contract.js");

test("save slots capture a snapshot and load into a fresh live session clone", () => {
  dbModule.resetDb();

  const player = gameModule.getOrCreatePlayer({ playerId: "player-live", name: "Avery" });
  gameModule.addEvent(player.id, "player", "inspect the lantern");
  gameModule.addEvent(player.id, "narrator", "The lantern flashes and reveals a bridge route.");
  gameModule.addCommittedTurnEvent(
    httpContractModule.createCommittedTurnEventPayload({
      eventId: "event-accepted",
      playerId: player.id,
      occurredAt: "2026-03-09T00:00:00.000Z",
      input: "inspect the lantern",
      outcome: {
        status: "accepted",
        summary: "The lantern reveals the bridge route.",
        rejection_reason: null
      },
      committed: {
        state_updates: {
          location: "Rooftop Market",
          inventory_add: ["bridge pass"],
          inventory_remove: [],
          flags_add: ["bridge_route_seen"],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "The route to the tower is clearer now."
        },
        memory_updates: ["The lantern revealed a bridge route."]
      },
      rulesetVersion: "story-rules/v1"
    })
  );

  const savedSlot = saveSlotsModule.savePlayerToSlot({
    playerId: player.id,
    label: "Checkpoint Alpha"
  });

  assert.equal(savedSlot.label, "Checkpoint Alpha");
  assert.equal(savedSlot.status, "ready");
  assert.equal(savedSlot.player_name, "Avery");

  const loaded = saveSlotsModule.loadPlayerFromSaveSlot(savedSlot.id);
  assert.notEqual(loaded.player.id, player.id);
  assert.notEqual(loaded.player.id, savedSlot.player_id);
  assert.equal(loaded.player.location, player.location);
  assert.deepEqual(gameModule.getShortHistory(loaded.player.id, 6), [
    "PLAYER: inspect the lantern",
    "NARRATOR: The lantern flashes and reveals a bridge route."
  ]);
  assert.equal(gameModule.getCommittedTurnEvents(loaded.player.id).length, 2);

  const updatedLoadedPlayer = gameModule.updatePlayerState(loaded.player.id, {
    location: "Sky Bridge",
    inventory_add: [],
    inventory_remove: [],
    flags_add: ["bridge_crossed"],
    flags_remove: [],
    quests: []
  });
  assert.equal(updatedLoadedPlayer?.location, "Sky Bridge");

  const loadedAgain = saveSlotsModule.loadPlayerFromSaveSlot(savedSlot.id);
  assert.equal(loadedAgain.player.location, "Rooftop Market");
  assert.equal(loadedAgain.slot.id, savedSlot.id);
});

test("save slot listing reports corrupted slot snapshots in plain language", () => {
  dbModule.resetDb();

  const player = gameModule.getOrCreatePlayer({ playerId: "player-corrupt", name: "Casey" });
  const savedSlot = saveSlotsModule.savePlayerToSlot({
    playerId: player.id,
    label: "Damaged Slot"
  });

  const database = dbModule.getDb();
  database.prepare("UPDATE players SET inventory = ? WHERE id = ?").run("not-json", savedSlot.player_id);

  const listedSlots = saveSlotsModule.listSaveSlots();
  assert.equal(listedSlots.length, 1);
  assert.equal(listedSlots[0]?.status, "corrupted");
  assert.match(listedSlots[0]?.detail || "", /saved inventory data is damaged/i);
});

test.after(() => {
  dbModule.closeDb();
  rmSync(tempDirectory, { recursive: true, force: true });
});

function pathSeparator(): string {
  return os.tmpdir().includes("\\") ? "\\" : "/";
}
