import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, "game.db");

export function resolveDbPath(): string {
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

export function getDataDirectory(dbPath: string): string {
  return path.dirname(dbPath);
}

export function getBackupDirectory(dbPath: string): string {
  return path.join(getDataDirectory(dbPath), "backups");
}

export function ensureDbDirectory(dbPath: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
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
