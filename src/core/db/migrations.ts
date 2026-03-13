import Database from "better-sqlite3";
import { ensureDbDirectory } from "./paths.js";
import { createDbBackup, inspectDbStorageHealth } from "./storage.js";

type Migration = {
  id: string;
  description: string;
  apply: (db: Database.Database) => void;
};

interface MigrationRow {
  id: string;
}

interface TableInfoRow {
  name: string;
}

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

export function getExpectedMigrationIds(): string[] {
  return MIGRATIONS.map((migration) => migration.id);
}

export function runMigrations(params: {
  dbPath: string;
  getDb: () => Database.Database;
  closeDb: () => void;
}): { applied: string[]; pending: string[]; dbPath: string; backupPath: string | null } {
  const inspection = inspectDbStorageHealth(params.dbPath, getExpectedMigrationIds());
  let backupPath: string | null = null;
  if (inspection.dbExists && !inspection.openError && inspection.missingMigrationIds.length > 0) {
    params.closeDb();
    backupPath = createDbBackup(params.dbPath, "migration");
  }

  const database = params.getDb();
  ensureDbDirectory(params.dbPath);
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

  return {
    applied,
    pending: MIGRATIONS.filter((migration) => !appliedBefore.has(migration.id) && !applied.includes(migration.id)).map(
      (migration) => migration.id
    ),
    dbPath: params.dbPath,
    backupPath
  };
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
