import { constants as fsConstants } from "node:fs";
import { access, mkdir, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimePreflightIssue, RuntimePreflightIssueDetails } from "../core/types.js";

export const LOW_DISK_WARNING_BYTES = 2 * 1024 * 1024 * 1024;
export const LOW_DISK_BLOCKER_BYTES = 512 * 1024 * 1024;

export async function probeHostPrerequisiteIssues(cwd = process.cwd()): Promise<RuntimePreflightIssue[]> {
  const issues: RuntimePreflightIssue[] = [];
  const dataDirectory = getRuntimeDataDirectory(cwd);
  const dbPath = path.join(dataDirectory, "game.db");

  const writeIssue = await probeWritableDataDirectory(dataDirectory, dbPath);
  if (writeIssue) {
    issues.push(writeIssue);
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

export function getRuntimeDataDirectory(cwd = process.cwd()): string {
  return path.resolve(cwd, "data");
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

async function probeWritableDataDirectory(dataDirectory: string, dbPath: string): Promise<RuntimePreflightIssue | null> {
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
