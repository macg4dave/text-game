import { constants as fsConstants } from "node:fs";
import { access, mkdir, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDirectory, inspectDbStorageHealth, type DbStorageHealthReport } from "../core/db.js";
import type { RuntimePreflightIssue, RuntimePreflightIssueDetails } from "../core/types.js";

export const LOW_DISK_WARNING_BYTES = 2 * 1024 * 1024 * 1024;
export const LOW_DISK_BLOCKER_BYTES = 512 * 1024 * 1024;

export async function probeHostPrerequisiteIssues(): Promise<RuntimePreflightIssue[]> {
  const issues: RuntimePreflightIssue[] = [];
  const storageHealth = inspectDbStorageHealth();
  const dataDirectory = storageHealth.dataDirectory;
  const dbPath = storageHealth.dbPath;
  const backupDirectory = storageHealth.backupDirectory;

  const writeIssue = await probeWritableDataDirectory(dataDirectory, dbPath, backupDirectory);
  if (writeIssue) {
    issues.push(writeIssue);
    return issues;
  }

  issues.push(...buildStorageHealthIssues(storageHealth));
  if (issues.some((issue) => issue.severity === "blocker")) {
    return issues;
  }

  const freeBytes = await readFreeBytes(dataDirectory);
  if (freeBytes === null) {
    return issues;
  }

  const diskIssue = buildLowDiskSpaceIssue(freeBytes, dataDirectory);
  if (diskIssue) {
    issues.push(diskIssue);
  }

  return issues;
}

export function getRuntimeDataDirectory(): string {
  return getDataDirectory();
}

export function buildStorageHealthIssues(report: DbStorageHealthReport): RuntimePreflightIssue[] {
  const issues: RuntimePreflightIssue[] = [];

  if (report.openError) {
    issues.push({
      code: "runtime_db_unreadable",
      severity: "blocker",
      area: "storage",
      title: "Fix the saved-game database before playing",
      message: `The app found a saved-game database at ${report.dbPath}, but it could not open it safely.`,
      recovery: [
        `Restore the database from ${report.backupDirectory} if a recent backup exists, or move the damaged file out of ${report.dataDirectory} before retrying.`,
        "Restart the app after the saved-game database is readable again."
      ],
      recommended_fix: `Restore the database from ${report.backupDirectory} if a recent backup exists, or move the damaged file out of ${report.dataDirectory} before retrying.`,
      env_vars: [],
      details: buildIssueDetails({
        check: "runtime-db-open",
        probe_target: report.dbPath,
        notes: [report.openError]
      })
    });
  }

  if (report.integrityMessage) {
    issues.push({
      code: "runtime_db_corrupted",
      severity: "blocker",
      area: "storage",
      title: "Repair or replace the saved-game database",
      message: "SQLite reported corruption in the saved-game database during startup.",
      recovery: [
        `Restore the database from ${report.backupDirectory} if a recent backup exists, or reset the local save data if you can afford to lose the current session.`,
        "Restart the app after the database integrity problem is fixed."
      ],
      recommended_fix: `Restore the database from ${report.backupDirectory} if a recent backup exists, or reset the local save data if you can afford to lose the current session.`,
      env_vars: [],
      details: buildIssueDetails({
        check: "runtime-db-integrity",
        probe_target: report.dbPath,
        notes: [report.integrityMessage]
      })
    });
  }

  if (report.corruptedPlayerIds.length > 0) {
    issues.push({
      code: "save_metadata_corrupted",
      severity: "blocker",
      area: "storage",
      title: "Repair or replace the saved-game metadata",
      message: "At least one saved session contains corrupted state metadata that the app cannot safely replay.",
      recovery: [
        `Restore the affected save from ${report.backupDirectory} if a recent backup exists, or remove the damaged save data before retrying.`,
        "Restart the app after the saved-game metadata is valid again."
      ],
      recommended_fix: `Restore the affected save from ${report.backupDirectory} if a recent backup exists, or remove the damaged save data before retrying.`,
      env_vars: [],
      details: buildIssueDetails({
        check: "runtime-save-metadata",
        probe_target: report.dbPath,
        notes: [
          `Affected player ids: ${report.corruptedPlayerIds.join(", ")}`,
          `Applied migrations: ${report.appliedMigrationIds.join(", ") || "none recorded"}`
        ]
      })
    });
  }

  return issues;
}

export function buildStorageStartupIssue(
  error: unknown,
  report = inspectDbStorageHealth()
): RuntimePreflightIssue {
  const [primaryIssue] = buildStorageHealthIssues(report);
  if (primaryIssue) {
    return primaryIssue;
  }

  const errorMessage = getErrorMessage(error);
  const needsBackupFix = /backup/i.test(errorMessage);

  return {
    code: needsBackupFix ? "runtime_backup_recovery_failed" : "runtime_storage_startup_failed",
    severity: "blocker",
    area: "storage",
    title: needsBackupFix ? "Fix the recovery backup folder before continuing" : "Fix the saved-game storage before continuing",
    message: needsBackupFix
      ? `The app could not create or use its recovery backup folder at ${report.backupDirectory} during startup.`
      : "The app could not finish preparing the saved-game storage during startup.",
    recovery: needsBackupFix
      ? [
          `Confirm that ${report.backupDirectory} exists on a writable drive and your user account can create files there.`,
          "Restart the app after the recovery backup folder is writable again."
        ]
      : [
          `Inspect ${report.dbPath} and ${report.backupDirectory}, fix the reported storage problem, then retry startup.`,
          "If the local save cannot be recovered, move it aside or reset the local DB before retrying."
        ],
    recommended_fix: needsBackupFix
      ? `Confirm that ${report.backupDirectory} exists on a writable drive and your user account can create files there.`
      : `Inspect ${report.dbPath} and ${report.backupDirectory}, fix the reported storage problem, then retry startup.`,
    env_vars: [],
    details: buildIssueDetails({
      check: needsBackupFix ? "runtime-backup-path" : "runtime-storage-startup",
      probe_target: needsBackupFix ? report.backupDirectory : report.dbPath,
      notes: [errorMessage]
    })
  };
}

export function buildLowDiskSpaceIssue(freeBytes: number, targetPath: string): RuntimePreflightIssue | null {
  if (freeBytes >= LOW_DISK_WARNING_BYTES) {
    return null;
  }

  const isBlocking = freeBytes < LOW_DISK_BLOCKER_BYTES;
  const recommendedSpace = formatBytes(LOW_DISK_WARNING_BYTES);

  return {
    code: isBlocking ? "runtime_disk_space_blocker" : "runtime_disk_space_warning",
    severity: isBlocking ? "blocker" : "warning",
    area: "storage",
    title: isBlocking ? "Free up disk space before playing" : "App storage is getting low",
    message: isBlocking
      ? `The drive that contains the app data folder only has ${formatBytes(freeBytes)} free.`
      : `The drive that contains the app data folder is down to ${formatBytes(freeBytes)} free.`,
    recovery: isBlocking
      ? [
          `Free up space on the drive that contains ${targetPath} before starting a session.`,
          `Keep at least ${recommendedSpace} free so saves, logs, and updates have room to work.`
        ]
      : [
          `Free up space on the drive that contains ${targetPath} soon.`,
          `Keeping at least ${recommendedSpace} free will reduce the risk of save or log failures.`
        ],
    recommended_fix: isBlocking
      ? `Free up space on the drive that contains ${targetPath} before starting a session.`
      : `Free up space on the drive that contains ${targetPath} soon.`,
    env_vars: [],
    details: buildIssueDetails({
      check: "runtime-disk-space",
      probe_target: targetPath,
      resolved_value: freeBytes,
      notes: [
        `Warning threshold: ${formatBytes(LOW_DISK_WARNING_BYTES)} free.`,
        `Blocker threshold: below ${formatBytes(LOW_DISK_BLOCKER_BYTES)} free.`
      ]
    })
  };
}

async function probeWritableDataDirectory(
  dataDirectory: string,
  dbPath: string,
  backupDirectory: string
): Promise<RuntimePreflightIssue | null> {
  try {
    await mkdir(dataDirectory, { recursive: true });
  } catch (error) {
    return buildDataPathIssue(
      "runtime_data_path_missing",
      "Fix the app data folder",
      `The app could not create its data folder at ${dataDirectory}.`,
      dataDirectory,
      error
    );
  }

  try {
    await access(dataDirectory, fsConstants.R_OK | fsConstants.W_OK);
  } catch (error) {
    return buildDataPathIssue(
      "runtime_data_path_unwritable",
      "Fix the app data folder permissions",
      `The app data folder at ${dataDirectory} is not writable by this runtime.`,
      dataDirectory,
      error
    );
  }

  try {
    await access(dbPath, fsConstants.R_OK | fsConstants.W_OK);
  } catch (error) {
    const missingFile = isMissingFileError(error);
    if (!missingFile) {
      return buildDataPathIssue(
        "runtime_db_unwritable",
        "Fix the saved-game database permissions",
        `The app found a database file at ${dbPath}, but it is not writable.`,
        dbPath,
        error
      );
    }

    try {
      await mkdir(backupDirectory, { recursive: true });
      await access(backupDirectory, fsConstants.R_OK | fsConstants.W_OK);
    } catch (error) {
      return {
        code: "runtime_backup_path_unwritable",
        severity: "blocker",
        area: "storage",
        title: "Fix the recovery backup folder permissions",
        message: `The app could not use its recovery backup folder at ${backupDirectory}.`,
        recovery: [
          `Confirm that ${backupDirectory} exists on a writable drive and your user account can create files there.`,
          "Restart the app after fixing the backup folder permissions or moving the project data to a writable location."
        ],
        recommended_fix: `Confirm that ${backupDirectory} exists on a writable drive and your user account can create files there.`,
        env_vars: [],
        details: buildIssueDetails({
          check: "runtime-backup-path",
          probe_target: backupDirectory,
          notes: [getErrorMessage(error)]
        })
      };
    }
  }

  const probePath = path.join(dataDirectory, `.preflight-write-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(probePath, "ok", "utf8");
  } catch (error) {
    return buildDataPathIssue(
      "runtime_data_path_write_probe_failed",
      "Fix the app data folder permissions",
      `The app could not create a temporary file in ${dataDirectory}.`,
      dataDirectory,
      error
    );
  } finally {
    await unlink(probePath).catch(() => undefined);
  }

  return null;
}

async function readFreeBytes(targetPath: string): Promise<number | null> {
  try {
    const stats = await statfs(targetPath);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

function buildDataPathIssue(
  code: string,
  title: string,
  message: string,
  targetPath: string,
  error: unknown
): RuntimePreflightIssue {
  return {
    code,
    severity: "blocker",
    area: "storage",
    title,
    message,
    recovery: [
      `Confirm that ${targetPath} exists on a writable drive and your user account can create files there.`,
      "Restart the app after fixing the folder permissions or moving the project to a writable location."
    ],
    recommended_fix: `Confirm that ${targetPath} exists on a writable drive and your user account can create files there.`,
    env_vars: [],
    details: buildIssueDetails({
      check: "runtime-data-path",
      probe_target: targetPath,
      notes: [getErrorMessage(error)]
    })
  };
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) {
    return `${Math.round((value / (1024 * 1024 * 1024)) * 10) / 10} GB`;
  }

  return `${Math.max(1, Math.round(value / (1024 * 1024)))} MB`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function buildIssueDetails(details: RuntimePreflightIssueDetails): RuntimePreflightIssueDetails {
  return details;
}
