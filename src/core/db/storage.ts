import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { ensureDbDirectory, getBackupDirectory, getDataDirectory } from "./paths.js";

interface MigrationRow {
  id: string;
}

interface PlayerMetadataRow {
  id: string;
  inventory: string;
  flags: string;
  quests: string;
  director_state: string;
}

export interface DbStorageHealthReport {
  dataDirectory: string;
  dbPath: string;
  backupDirectory: string;
  dbExists: boolean;
  openError: string | null;
  integrityMessage: string | null;
  appliedMigrationIds: string[];
  missingMigrationIds: string[];
  unexpectedMigrationIds: string[];
  corruptedPlayerIds: string[];
}

export function inspectDbStorageHealth(dbPath: string, expectedMigrationIds: string[]): DbStorageHealthReport {
  const report: DbStorageHealthReport = {
    dataDirectory: getDataDirectory(dbPath),
    dbPath,
    backupDirectory: getBackupDirectory(dbPath),
    dbExists: existsSync(dbPath),
    openError: null,
    integrityMessage: null,
    appliedMigrationIds: [],
    missingMigrationIds: [],
    unexpectedMigrationIds: [],
    corruptedPlayerIds: []
  };

  if (!report.dbExists) {
    return report;
  }

  let inspectionDb: Database.Database | null = null;

  try {
    inspectionDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    report.appliedMigrationIds = readAppliedMigrationIds(inspectionDb);
    report.missingMigrationIds = expectedMigrationIds.filter((id) => !report.appliedMigrationIds.includes(id));
    report.unexpectedMigrationIds = report.appliedMigrationIds.filter((id) => !expectedMigrationIds.includes(id));
    report.integrityMessage = readIntegrityMessage(inspectionDb);
    report.corruptedPlayerIds = readCorruptedPlayerIds(inspectionDb);
  } catch (error) {
    report.openError = getErrorMessage(error);
  } finally {
    inspectionDb?.close();
  }

  return report;
}

export function createDbBackup(dbPath: string, reason: "migration" | "reset"): string {
  ensureDbDirectory(dbPath);
  const backupDirectory = getBackupDirectory(dbPath);
  mkdirSync(backupDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `game.${reason}.${timestamp}.db`);

  copyFileSync(dbPath, backupPath);

  for (const suffix of ["-wal", "-shm"]) {
    const candidate = `${dbPath}${suffix}`;
    if (existsSync(candidate)) {
      copyFileSync(candidate, `${backupPath}${suffix}`);
    }
  }

  return backupPath;
}

export function removeDbFiles(filePath: string): boolean {
  let removed = false;
  for (const suffix of ["", "-shm", "-wal"]) {
    const candidate = `${filePath}${suffix}`;
    try {
      rmSync(candidate, { force: true });
      removed = true;
    } catch {
      // Best-effort cleanup is enough here; callers surface real reopen failures.
    }
  }

  return removed;
}

export function resetDbStorage(params: {
  dbPath: string;
  closeDb: () => void;
  reopenDb: () => void;
  runMigrations: () => { applied: string[]; dbPath: string };
}): { dbPath: string; removed: boolean; applied: string[]; backupPath: string | null } {
  const backupPath = existsSync(params.dbPath) ? createDbBackup(params.dbPath, "reset") : null;
  params.closeDb();
  const removed = removeDbFiles(params.dbPath);
  params.reopenDb();
  const result = params.runMigrations();

  return {
    dbPath: result.dbPath,
    removed,
    applied: result.applied,
    backupPath
  };
}

function readAppliedMigrationIds(database: Database.Database): string[] {
  if (!hasTable(database, "schema_migrations")) {
    return [];
  }

  const rows = database.prepare("SELECT id FROM schema_migrations ORDER BY applied_at ASC").all() as MigrationRow[];
  return rows.map((row) => row.id);
}

function readIntegrityMessage(database: Database.Database): string | null {
  const results = database.prepare("PRAGMA quick_check").pluck().all() as string[];
  const firstProblem = results.find((value) => value !== "ok");
  return firstProblem ?? null;
}

function readCorruptedPlayerIds(database: Database.Database): string[] {
  if (!hasTable(database, "players")) {
    return [];
  }

  const rows = database
    .prepare("SELECT id, inventory, flags, quests, director_state FROM players ORDER BY created_at ASC LIMIT 25")
    .all() as PlayerMetadataRow[];

  const corruptedPlayerIds = new Set<string>();
  for (const row of rows) {
    for (const value of [row.inventory, row.flags, row.quests, row.director_state]) {
      try {
        JSON.parse(value);
      } catch {
        corruptedPlayerIds.add(row.id);
        break;
      }
    }
  }

  return Array.from(corruptedPlayerIds);
}

function hasTable(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { name?: string } | undefined;

  return row?.name === tableName;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
