import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLocalGpuSummary,
  getRuntimeConfigDiagnostics,
  getRuntimeLocalGpuSelection,
  getRuntimePreflight,
  getRuntimeProfile
} from "./session-data.js";

function createPreflight(status: "ready" | "action-required" | "checking", summary: string) {
  return {
    ok: status === "ready",
    status,
    summary,
    issues: [],
    counts: { blocker: status === "action-required" ? 1 : 0, warning: 0, info: 0 },
    checked_at: "2026-03-08T00:00:00.000Z"
  };
}

test("getRuntimePreflight prefers newer runtime debug data over the bootstrap setup snapshot", () => {
  const preflight = getRuntimePreflight(
    { preflight: createPreflight("action-required", "Blocked") } as never,
    { runtime: { preflight: createPreflight("ready", "Ready") } },
    null
  );

  assert.equal(preflight?.status, "ready");
});

test("getRuntimePreflight falls back to setup preflight when runtime debug data is absent", () => {
  const preflight = getRuntimePreflight({ preflight: createPreflight("action-required", "Blocked") } as never, null, null);

  assert.equal(preflight?.status, "action-required");
  assert.equal(preflight?.summary, "Blocked");
});

test("runtime selectors read values from session debug when setup data is absent", () => {
  const sessionDebug = {
    runtime: {
      preflight: createPreflight("checking", "Checking AI"),
      config_diagnostics: { profile_overrides: [{ field: "chat_model" }] },
      profile: { label: "Local GPU Small" },
      local_gpu: { requested: true, profile_label: "8 GB tier", detected_vram_gb: 8 }
    }
  };

  assert.equal(getRuntimePreflight(null, sessionDebug, null)?.status, "checking");
  assert.equal(getRuntimeConfigDiagnostics(sessionDebug, null)?.profile_overrides?.length, 1);
  assert.equal(getRuntimeProfile(sessionDebug, null)?.label, "Local GPU Small");
  assert.equal(getRuntimeLocalGpuSelection(sessionDebug, null)?.profile_label, "8 GB tier");
});

test("formatLocalGpuSummary returns null when local GPU mode was not requested", () => {
  assert.equal(formatLocalGpuSummary(null), null);
  assert.equal(formatLocalGpuSummary({ requested: false }), null);
});

test("formatLocalGpuSummary includes label, source, and detected VRAM", () => {
  const summary = formatLocalGpuSummary({
    requested: true,
    profile_label: "8 GB tier",
    selection_source: "detected-profile",
    detected_vram_gb: 8
  });

  assert.equal(summary, "8 GB tier | detected profile | 8 GB detected");
});
