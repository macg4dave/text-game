import Database from "better-sqlite3";
import path from "node:path";
import process from "node:process";

const dbPath = path.resolve(process.cwd(), "data", "game.db");
const db = new Database(dbPath);

interface TableInfoRow {
  name: string;
}

export function initDb(): void {
  db.exec(`
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
      embedding TEXT,
      FOREIGN KEY(player_id) REFERENCES players(id)
    );
  `);

  addColumnIfMissing("memories", "embedding", "TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_player_id ON events(player_id);
    CREATE INDEX IF NOT EXISTS idx_memories_player_id ON memories(player_id);
  `);
}

export function getDb() {
  return db;
}

function addColumnIfMissing(table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
  const exists = columns.some((col) => col.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
