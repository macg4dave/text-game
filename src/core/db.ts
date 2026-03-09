import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

type Migration = {
  id: string;
  description: string;
  apply: (db: Database.Database) => void;
};

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, "game.db");
const dbPath = resolveDbPath();

let db: Database.Database | null = null;
let migrationsApplied = false;

const MIGRATIONS: Migration[] = [
  {
    id: "001_initial_schema",
    description: "create players, events, and memories tables",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          name TEXT,
          created_at TEXT NOT NULL,
          location TEXT NOT NULL,
          summary TEXT NOT NULL,
          director_state TEXT NOT NULL,
          inventory TEXT NOT NULL,
          flags TEXT NOT NULL,
          quests TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(player_id) REFERENCES players(id)
        );

        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(player_id) REFERENCES players(id)
        );
      `);
    }
  },
  {
    id: "002_memory_embeddings_and_indexes",
    description: "add memory embeddings column and supporting indexes",
    apply(database) {
      addColumnIfMissing(database, "memories", "embedding", "TEXT");
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_events_player_id ON events(player_id);
        CREATE INDEX IF NOT EXISTS idx_memories_player_id ON memories(player_id);
      `);
    }
  },
  {
    id: "003_committed_event_log",
    description: "add committed event log table for canonical replay records",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS committed_events (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          event_kind TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(player_id) REFERENCES players(id)
        );

        CREATE INDEX IF NOT EXISTS idx_committed_events_player_id ON committed_events(player_id, created_at);
      `);
    }
  },
  {
    id: "004_save_slots",
    description: "add named save slot metadata table",
    apply(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS save_slots (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          player_id TEXT NOT NULL,
          source_schema_version TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(player_id) REFERENCES players(id)
        );

        CREATE INDEX IF NOT EXISTS idx_save_slots_updated_at ON save_slots(updated_at DESC, created_at DESC);
      `);
    }
  }
];

interface MigrationRow {
  id: string;
}

interface TableInfoRow {
  name: string;
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
  return path.dirname(dbPath);
}

export function getBackupDirectory(): string {
  return path.join(getDataDirectory(), "backups");
}

export function getExpectedMigrationIds(): string[] {
  return MIGRATIONS.map((migration) => migration.id);
}

export function inspectDbStorageHealth(): DbStorageHealthReport {
  const report: DbStorageHealthReport = {
    dataDirectory: getDataDirectory(),
    dbPath,
    backupDirectory: getBackupDirectory(),
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
    const expectedMigrationIds = getExpectedMigrationIds();
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

export function runMigrations(): { applied: string[]; pending: string[]; dbPath: string; backupPath: string | null } {
  const inspection = inspectDbStorageHealth();
  let backupPath: string | null = null;
  if (inspection.dbExists && !inspection.openError && inspection.missingMigrationIds.length > 0) {
    closeDb();
    backupPath = createDbBackup("migration");
  }

  const database = getDb();
  ensureDbDirectory();
  ensureMigrationTable(database);

  const appliedBefore = getAppliedMigrationIds(database);
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedBefore.has(migration.id)) {
      continue;
    }

    database.transaction(() => {
      migration.apply(database);
      database
        .prepare("INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)")
        .run(migration.id, migration.description, new Date().toISOString());
    })();
    applied.push(migration.id);
  }

  migrationsApplied = true;

  return {
    applied,
    pending: MIGRATIONS.filter((migration) => !appliedBefore.has(migration.id) && !applied.includes(migration.id)).map(
      (migration) => migration.id
    ),
    dbPath,
    backupPath
  };
}

export function resetDb(): { dbPath: string; removed: boolean; applied: string[]; backupPath: string | null } {
  const backupPath = existsSync(dbPath) ? createDbBackup("reset") : null;
  closeDb();
  const removed = removeDbFiles(dbPath);
  const database = openDb();
  db = database;
  migrationsApplied = false;
  const result = runMigrations();

  return {
    dbPath: result.dbPath,
    removed,
    applied: result.applied,
    backupPath
  };
}

export function closeDb(): void {
  if (!db) {
    return;
  }

  db.close();
  db = null;
}

function openDb(): Database.Database {
  ensureDbDirectory();
  return new Database(dbPath);
}

function ensureDbDirectory(): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
}

function ensureMigrationTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function getAppliedMigrationIds(database: Database.Database): Set<string> {
  const rows = database.prepare("SELECT id FROM schema_migrations ORDER BY applied_at ASC").all() as MigrationRow[];
  return new Set(rows.map((row) => row.id));
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

function addColumnIfMissing(database: Database.Database, table: string, column: string, type: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
  const exists = columns.some((col) => col.name === column);
  if (!exists) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function removeDbFiles(filePath: string): boolean {
  let removed = false;
  for (const suffix of ["", "-shm", "-wal"]) {
    const candidate = `${filePath}${suffix}`;
    try {
      rmSync(candidate, { force: true });
      removed = true;
    } catch {
      // A best-effort delete is enough for reset; the follow-on open will surface real failures.
    }
  }

  return removed;
}

function createDbBackup(reason: "migration" | "reset"): string {
  ensureDbDirectory();
  const backupDirectory = getBackupDirectory();
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

function resolveDbPath(): string {
  const explicitPath = readEnv("GAME_DB_PATH", "DB_PATH");
  if (explicitPath) {
    return path.resolve(process.cwd(), explicitPath);
  }

  const dataDir = readEnv("GAME_DATA_DIR");
  if (dataDir) {
    return path.resolve(process.cwd(), dataDir, "game.db");
  }

  return DEFAULT_DB_PATH;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return path.resolve(entryPath) === fileURLToPath(import.meta.url);
}

function runCli(): void {
  const command = process.argv[2] || "migrate";

  try {
    if (command === "migrate") {
      const result = runMigrations();
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            command,
            dbPath: result.dbPath,
            applied: result.applied,
            pending: result.pending,
            backupPath: result.backupPath,
            migrationsApplied
          },
          null,
          2
        ) + "\n"
      );
      return;
    }

    if (command === "reset") {
      const result = resetDb();
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            command,
            dbPath: result.dbPath,
            removed: result.removed,
            applied: result.applied,
            backupPath: result.backupPath
          },
          null,
          2
        ) + "\n"
      );
      return;
    }

    process.stderr.write(`Unknown DB command: ${command}. Use "migrate" or "reset".\n`);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}

if (isDirectExecution()) {
  runCli();
}
