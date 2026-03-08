import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
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
  }
];

interface MigrationRow {
  id: string;
}

interface TableInfoRow {
  name: string;
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

export function runMigrations(): { applied: string[]; pending: string[]; dbPath: string } {
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
    dbPath
  };
}

export function resetDb(): { dbPath: string; removed: boolean; applied: string[] } {
  closeDb();
  const removed = removeDbFiles(dbPath);
  const database = openDb();
  db = database;
  migrationsApplied = false;
  const result = runMigrations();

  return {
    dbPath: result.dbPath,
    removed,
    applied: result.applied
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
            applied: result.applied
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
