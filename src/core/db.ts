import Database from "better-sqlite3";
import { isDirectExecution, runDbCli } from "./db/cli.js";
import { getExpectedMigrationIds as getExpectedMigrationIdsFromMigrations, runMigrations as runMigrationsWithDefinitions } from "./db/migrations.js";
import { ensureDbDirectory, getBackupDirectory as getBackupDirectoryForDbPath, getDataDirectory as getDataDirectoryForDbPath, resolveDbPath } from "./db/paths.js";
import { inspectDbStorageHealth as inspectDbStorageHealthForPath, resetDbStorage, type DbStorageHealthReport } from "./db/storage.js";

const dbPath = resolveDbPath();

let db: Database.Database | null = null;
let migrationsApplied = false;

export type { DbStorageHealthReport };

export function initDb(): void {
  runMigrations();
}

export function getDb(): Database.Database {
  if (!db) {
    db = openDb();
  }

  return db;
}

export function getDbPath(): string {
  return dbPath;
}

export function getDataDirectory(): string {
  return getDataDirectoryForDbPath(dbPath);
}

export function getBackupDirectory(): string {
  return getBackupDirectoryForDbPath(dbPath);
}

export function getExpectedMigrationIds(): string[] {
  return getExpectedMigrationIdsFromMigrations();
}

export function inspectDbStorageHealth(): DbStorageHealthReport {
  return inspectDbStorageHealthForPath(dbPath, getExpectedMigrationIds());
}

export function runMigrations(): { applied: string[]; pending: string[]; dbPath: string; backupPath: string | null } {
  const result = runMigrationsWithDefinitions({ dbPath, getDb, closeDb });
  migrationsApplied = true;
  return result;
}

export function resetDb(): { dbPath: string; removed: boolean; applied: string[]; backupPath: string | null } {
  return resetDbStorage({
    dbPath,
    closeDb,
    reopenDb: () => {
      db = openDb();
      migrationsApplied = false;
    },
    runMigrations
  });
}

export function closeDb(): void {
  if (!db) {
    return;
  }

  db.close();
  db = null;
}

function openDb(): Database.Database {
  ensureDbDirectory(dbPath);
  return new Database(dbPath);
}

if (isDirectExecution(import.meta.url)) {
  runDbCli({
    runMigrations,
    resetDb,
    closeDb,
    migrationsApplied: () => migrationsApplied
  });
}
