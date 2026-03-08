import type {
  RuntimeConfigDiagnostics,
  RuntimeConfigProfile,
  RuntimeLocalGpuSelection,
  RuntimePreflightPayload,
  SessionDebugPayload,
  SetupStatus,
  TurnDebugPayload
} from "./contracts.js";

export function getRuntimePreflight(
  setupStatus: SetupStatus | null,
  sessionDebug: SessionDebugPayload | null,
  lastTurnDebug: TurnDebugPayload | null
): RuntimePreflightPayload | null {
  const runtime = sessionDebug?.runtime || lastTurnDebug?.runtime;
  if (!runtime || typeof runtime !== "object") {
    const setupPreflight = setupStatus?.preflight;
    return setupPreflight && typeof setupPreflight === "object" ? setupPreflight : null;
  }

  const candidate = (runtime as { preflight?: unknown }).preflight;
  if (candidate && typeof candidate === "object") {
    return candidate as RuntimePreflightPayload;
  }

  const setupPreflight = setupStatus?.preflight;
  return setupPreflight && typeof setupPreflight === "object" ? setupPreflight : null;
}

export function getRuntimeConfigDiagnostics(
  sessionDebug: SessionDebugPayload | null,
  lastTurnDebug: TurnDebugPayload | null
): RuntimeConfigDiagnostics | null {
  const runtime = sessionDebug?.runtime || lastTurnDebug?.runtime;
  if (!runtime || typeof runtime !== "object") {
    return null;
  }

  const candidate = (runtime as { config_diagnostics?: unknown }).config_diagnostics;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as RuntimeConfigDiagnostics;
}

export function getRuntimeProfile(
  sessionDebug: SessionDebugPayload | null,
  lastTurnDebug: TurnDebugPayload | null
): RuntimeConfigProfile | null {
  const runtime = sessionDebug?.runtime || lastTurnDebug?.runtime;
  if (!runtime || typeof runtime !== "object") {
    return null;
  }

  const candidate = (runtime as { profile?: unknown }).profile;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as RuntimeConfigProfile;
}

export function getRuntimeLocalGpuSelection(
  sessionDebug: SessionDebugPayload | null,
  lastTurnDebug: TurnDebugPayload | null
): RuntimeLocalGpuSelection | null {
  const runtime = sessionDebug?.runtime || lastTurnDebug?.runtime;
  if (!runtime || typeof runtime !== "object") {
    return null;
  }

  const candidate = (runtime as { local_gpu?: unknown }).local_gpu;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as RuntimeLocalGpuSelection;
}

export function formatLocalGpuSummary(selection: RuntimeLocalGpuSelection | null): string | null {
  if (!selection || !selection.requested) {
    return null;
  }

  const label = selection.profile_label || selection.profile_id || "Local GPU profile";
  const source = selection.selection_source ? selection.selection_source.replace(/-/g, " ") : "local GPU";
  const vram = typeof selection.detected_vram_gb === "number" ? `${selection.detected_vram_gb} GB detected` : null;
  const parts = [label, source, vram].filter((value): value is string => Boolean(value));
  return parts.join(" | ");
}
