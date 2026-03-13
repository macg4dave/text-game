import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tsxCliPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

test("db CLI migrate and reset keep the documented command contract stable", () => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "text-game-db-test-"));
  const env = {
    ...process.env,
    GAME_DATA_DIR: tempDirectory
  };
  const expectedDbPath = path.join(tempDirectory, "game.db");

  try {
    const migrateResult = runDbCommand("migrate", env);
    assert.equal(migrateResult.status, 0, migrateResult.stderr || migrateResult.stdout);

    const migratePayload = JSON.parse(migrateResult.stdout) as {
      ok: boolean;
      command: string;
      dbPath: string;
      applied: string[];
      pending: string[];
      backupPath: string | null;
      migrationsApplied: boolean;
    };

    assert.equal(migratePayload.ok, true);
    assert.equal(migratePayload.command, "migrate");
    assert.equal(migratePayload.dbPath, expectedDbPath);
    assert.deepEqual(migratePayload.applied, [
      "001_initial_schema",
      "002_memory_embeddings_and_indexes",
      "003_committed_event_log",
      "004_save_slots"
    ]);
    assert.deepEqual(migratePayload.pending, []);
    assert.equal(migratePayload.backupPath, null);
    assert.equal(migratePayload.migrationsApplied, true);
    assert.equal(existsSync(expectedDbPath), true);

    const migratedDb = new Database(expectedDbPath);
    migratedDb
      .prepare(
        `INSERT INTO players (id, name, created_at, location, summary, director_state, inventory, flags, quests)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "player-reset-check",
        "Avery",
        "2026-03-13T00:00:00.000Z",
        "Rooftop Market",
        "Testing reset",
        JSON.stringify({
          end_goal: "Reach the tower",
          current_act_id: "act-1",
          current_act: "Arrival",
          current_beat_id: "beat-1",
          current_beat_label: "Find the signal",
          story_beats_remaining: 3,
          end_goal_progress: "Testing",
          completed_beats: []
        }),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([])
      );
    migratedDb.close();

    const resetResult = runDbCommand("reset", env);
    assert.equal(resetResult.status, 0, resetResult.stderr || resetResult.stdout);

    const resetPayload = JSON.parse(resetResult.stdout) as {
      ok: boolean;
      command: string;
      dbPath: string;
      removed: boolean;
      applied: string[];
      backupPath: string | null;
    };

    assert.equal(resetPayload.ok, true);
    assert.equal(resetPayload.command, "reset");
    assert.equal(resetPayload.dbPath, expectedDbPath);
    assert.equal(resetPayload.removed, true);
    assert.deepEqual(resetPayload.applied, [
      "001_initial_schema",
      "002_memory_embeddings_and_indexes",
      "003_committed_event_log",
      "004_save_slots"
    ]);
    assert.equal(typeof resetPayload.backupPath, "string");
    assert.equal(existsSync(resetPayload.backupPath as string), true);

    const resetDb = new Database(expectedDbPath, { readonly: true });
    const migrationCount = resetDb.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number };
    const playerCount = resetDb.prepare("SELECT COUNT(*) AS count FROM players").get() as { count: number };
    resetDb.close();

    assert.equal(migrationCount.count, 4);
    assert.equal(playerCount.count, 0);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

function runDbCommand(command: "migrate" | "reset", env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [tsxCliPath, "src/core/db.ts", command], {
    cwd: repoRoot,
    env,
    encoding: "utf8"
  });
}
