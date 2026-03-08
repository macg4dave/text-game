import {
  buildConfigPreflightIssues,
  createPreflightReport,
  hasBlockingPreflightIssue
} from "../core/config.js";
import type {
  AppConfig,
  RuntimePreflightIssue,
  RuntimePreflightReport
} from "../core/types.js";
import { probeHostPrerequisiteIssues } from "./host-preflight.js";
import { probeAiRuntimeIssues } from "./runtime-preflight-ai.js";

const DEFAULT_PREFLIGHT_CACHE_MS = 15000;

export interface RuntimePreflightService {
  getCurrentReport(): RuntimePreflightReport;
  ensureReport(options?: { force?: boolean }): Promise<RuntimePreflightReport>;
}

export function createRuntimePreflightService(
  config: AppConfig,
  cacheMs = DEFAULT_PREFLIGHT_CACHE_MS,
  getAdditionalIssues: () => RuntimePreflightIssue[] = () => []
): RuntimePreflightService {
  let runtimePreflight = createInitialRuntimePreflight(config);
  let runtimePreflightCheckStartedAt = 0;
  let runtimePreflightPromise: Promise<RuntimePreflightReport> | null = null;

  return {
    getCurrentReport() {
      return runtimePreflight;
    },
    ensureReport
  };

  async function ensureReport({ force = false }: { force?: boolean } = {}): Promise<RuntimePreflightReport> {
    if (
      !force &&
      runtimePreflight.checked_at &&
      Date.now() - runtimePreflightCheckStartedAt < cacheMs
    ) {
      return runtimePreflight;
    }

    if (runtimePreflightPromise) {
      return runtimePreflightPromise;
    }

    runtimePreflightPromise = refreshRuntimePreflight();
    try {
      return await runtimePreflightPromise;
    } finally {
      runtimePreflightPromise = null;
    }
  }

  async function refreshRuntimePreflight(): Promise<RuntimePreflightReport> {
    runtimePreflightCheckStartedAt = Date.now();

    const configIssues = buildConfigPreflightIssues(config);
    const additionalIssues = dedupeIssues(getAdditionalIssues());
    const baseIssues = dedupeIssues([...configIssues, ...additionalIssues]);

    if (hasBlockingPreflightIssue(baseIssues)) {
      runtimePreflight = createPreflightReport(baseIssues);
      return runtimePreflight;
    }

    const hostIssues = await probeHostPrerequisiteIssues();
    const storageIssues = dedupeIssues([...baseIssues, ...hostIssues]);
    if (hasBlockingPreflightIssue(storageIssues)) {
      runtimePreflight = createPreflightReport(storageIssues);
      return runtimePreflight;
    }

    const aiIssues = await probeAiRuntimeIssues(config);
    runtimePreflight = createPreflightReport(dedupeIssues([...storageIssues, ...aiIssues]));
    return runtimePreflight;
  }
}

function createInitialRuntimePreflight(config: AppConfig): RuntimePreflightReport {
  const issues = buildConfigPreflightIssues(config);
  if (hasBlockingPreflightIssue(issues)) {
    return createPreflightReport(issues);
  }

  if (issues.length) {
    return createPreflightReport(issues, {
      status: "checking",
      summary: "Checking the remaining host and AI startup requirements before the first turn.",
      checkedAt: null
    });
  }

  return createPreflightReport([], {
    status: "checking",
    summary: "Checking host paths and AI connection before the first turn.",
    checkedAt: null
  });
}

function dedupeIssues(issues: RuntimePreflightIssue[]): RuntimePreflightIssue[] {
  const unique = new Map<string, RuntimePreflightIssue>();
  for (const issue of issues) {
    if (!unique.has(issue.code)) {
      unique.set(issue.code, issue);
    }
  }

  return Array.from(unique.values());
}
