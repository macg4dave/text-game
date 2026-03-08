import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLowDiskSpaceIssue,
  LOW_DISK_BLOCKER_BYTES,
  LOW_DISK_WARNING_BYTES
} from "./host-preflight.js";

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
