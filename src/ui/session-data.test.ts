import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLocalGpuSummary,
  getRuntimeConfigDiagnostics,
  getRuntimeLocalGpuSelection,
  getRuntimePreflight,
  getRuntimeProfile
} from "./session-data.js";

test("getRuntimePreflight prefers newer runtime debug data over the bootstrap setup snapshot", () => {
  const preflight = getRuntimePreflight(
    { preflight: { status: "action-required", summary: "Blocked" } },
    { runtime: { preflight: { status: "ready" } } },
    null
  );

  assert.equal(preflight?.status, "ready");
});

test("getRuntimePreflight falls back to setup preflight when runtime debug data is absent", () => {
  const preflight = getRuntimePreflight({ preflight: { status: "action-required", summary: "Blocked" } }, null, null);

  assert.equal(preflight?.status, "action-required");
  assert.equal(preflight?.summary, "Blocked");
});

test("runtime selectors read values from session debug when setup data is absent", () => {
  const sessionDebug = {
    runtime: {
      preflight: { status: "checking" },
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
