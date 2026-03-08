import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLowDiskSpaceIssue,
  buildStorageHealthIssues,
  LOW_DISK_BLOCKER_BYTES,
  LOW_DISK_WARNING_BYTES
} from "./host-preflight.js";

const healthyStorageReport = {
  dataDirectory: "/tmp/data",
  dbPath: "/tmp/data/game.db",
  backupDirectory: "/tmp/data/backups",
  dbExists: true,
  openError: null,
  integrityMessage: null,
  appliedMigrationIds: ["001_initial_schema", "002_memory_embeddings_and_indexes"],
  missingMigrationIds: [],
  unexpectedMigrationIds: [],
  corruptedPlayerIds: []
};

test("buildLowDiskSpaceIssue returns no issue when free space is healthy", () => {
  const issue = buildLowDiskSpaceIssue(LOW_DISK_WARNING_BYTES, "/tmp/data");
  assert.equal(issue, null);
});

test("buildLowDiskSpaceIssue returns a warning above the blocker threshold", () => {
  const issue = buildLowDiskSpaceIssue(LOW_DISK_BLOCKER_BYTES, "/tmp/data");
  assert.ok(issue);
  assert.equal(issue.severity, "warning");
  assert.equal(issue.area, "storage");
  assert.match(issue.message, /down to/i);
});

test("buildLowDiskSpaceIssue returns a blocker below the blocker threshold", () => {
  const issue = buildLowDiskSpaceIssue(LOW_DISK_BLOCKER_BYTES - 1, "/tmp/data");
  assert.ok(issue);
  assert.equal(issue.severity, "blocker");
  assert.equal(issue.area, "storage");
  assert.match(issue.message, /only has/i);
});

test("buildStorageHealthIssues returns no issues for a healthy save database", () => {
  assert.deepEqual(buildStorageHealthIssues(healthyStorageReport), []);
});

test("buildStorageHealthIssues reports unreadable save databases as blockers", () => {
  const issues = buildStorageHealthIssues({
    ...healthyStorageReport,
    openError: "SQLITE_CANTOPEN: unable to open database file"
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "runtime_db_unreadable");
  assert.equal(issues[0]?.severity, "blocker");
});

test("buildStorageHealthIssues reports database corruption as a blocker", () => {
  const issues = buildStorageHealthIssues({
    ...healthyStorageReport,
    integrityMessage: "database disk image is malformed"
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "runtime_db_corrupted");
  assert.equal(issues[0]?.severity, "blocker");
});

test("buildStorageHealthIssues reports corrupted player metadata as a blocker", () => {
  const issues = buildStorageHealthIssues({
    ...healthyStorageReport,
    corruptedPlayerIds: ["player-1"]
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "save_metadata_corrupted");
  assert.equal(issues[0]?.severity, "blocker");
  assert.match(issues[0]?.details?.notes?.[0] || "", /player-1/);
});
