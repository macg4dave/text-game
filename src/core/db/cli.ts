import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

export function isDirectExecution(moduleUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return path.resolve(entryPath) === fileURLToPath(moduleUrl);
}

export function runDbCli(params: {
  runMigrations: () => { applied: string[]; pending: string[]; dbPath: string; backupPath: string | null };
  resetDb: () => { dbPath: string; removed: boolean; applied: string[]; backupPath: string | null };
  closeDb: () => void;
  migrationsApplied: () => boolean;
}): void {
  const command = process.argv[2] || "migrate";

  try {
    if (command === "migrate") {
      const result = params.runMigrations();
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            command,
            dbPath: result.dbPath,
            applied: result.applied,
            pending: result.pending,
            backupPath: result.backupPath,
            migrationsApplied: params.migrationsApplied()
          },
          null,
          2
        ) + "\n"
      );
      return;
    }

    if (command === "reset") {
      const result = params.resetDb();
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

    process.stderr.write(`Unknown DB command: ${command}. Use \"migrate\" or \"reset\".\n`);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    params.closeDb();
  }
}
