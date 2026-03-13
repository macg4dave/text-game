import type { AppConfig, RuntimePreflightIssue, RuntimePreflightIssueDetails } from "../core/types.js";

const DESKTOP_SHELL_ENV_VAR = "TEXT_GAME_DESKTOP_SHELL";
const DESKTOP_DOCKER_STATE_ENV_VAR = "TEXT_GAME_DESKTOP_DOCKER_STATE";
const DESKTOP_GPU_STATE_ENV_VAR = "TEXT_GAME_DESKTOP_GPU_STATE";
const DESKTOP_NOTES_ENV_VAR = "TEXT_GAME_DESKTOP_PREREQ_NOTES";

export type DesktopShellDockerState = "missing" | "not-running" | "running";
export type DesktopShellGpuState = "tooling-missing" | "ready";

export interface DesktopShellPreflightContext {
  dockerState: DesktopShellDockerState | null;
  gpuState: DesktopShellGpuState | null;
  notes: string[];
}

export function readDesktopShellPreflightContext(
  env: NodeJS.ProcessEnv = process.env
): DesktopShellPreflightContext | null {
  if (env[DESKTOP_SHELL_ENV_VAR] !== "1") {
    return null;
  }

  const dockerState = normalizeDockerState(env[DESKTOP_DOCKER_STATE_ENV_VAR]);
  const gpuState = normalizeGpuState(env[DESKTOP_GPU_STATE_ENV_VAR]);
  const notes = splitNotes(env[DESKTOP_NOTES_ENV_VAR]);

  return {
    dockerState,
    gpuState,
    notes
  };
}

export function buildDesktopShellPrerequisiteIssues(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env
): RuntimePreflightIssue[] {
  return buildDesktopShellPrerequisiteIssuesFromContext(config, readDesktopShellPreflightContext(env));
}

export function buildDesktopShellPrerequisiteIssuesFromContext(
  config: AppConfig,
  context: DesktopShellPreflightContext | null
): RuntimePreflightIssue[] {
  if (!context || config.ai.provider !== "litellm") {
    return [];
  }

  const issues: RuntimePreflightIssue[] = [];

  if (context.dockerState === "missing") {
    issues.push({
      code: "docker_missing",
      severity: "blocker",
      area: "host",
      title: "Install Docker Desktop before playing",
      message:
        "The packaged MVP path could not find Docker Desktop, so the app cannot reach the repo-managed LiteLLM sidecar.",
      recovery: [
        "Install Docker Desktop for Windows, start it once, and wait for the Linux engine to finish starting.",
        "Retry the setup check after Docker Desktop is available."
      ],
      recommended_fix:
        "Install Docker Desktop for Windows, start it once, and wait for the Linux engine to finish starting.",
      env_vars: [],
      details: buildIssueDetails(context, {
        check: "desktop-shell-docker",
        probe_target: "Docker Desktop"
      })
    });
  }

  if (context.dockerState === "not-running") {
    issues.push({
      code: "docker_not_running",
      severity: "blocker",
      area: "host",
      title: "Start Docker Desktop before playing",
      message:
        "The packaged MVP path found Docker Desktop, but the Docker engine is not ready yet, so LiteLLM cannot start through the supported path.",
      recovery: [
        "Start Docker Desktop and wait for the Linux engine to report healthy before retrying.",
        "Retry the setup check without deleting saves or restarting the packaged shell."
      ],
      recommended_fix:
        "Start Docker Desktop and wait for the Linux engine to report healthy before retrying.",
      env_vars: [],
      details: buildIssueDetails(context, {
        check: "desktop-shell-docker",
        probe_target: "Docker Desktop"
      })
    });
  }

  if (shouldReportGpuToolingIssue(config, context)) {
    issues.push({
      code: "gpu_tooling_not_detected",
      severity: "blocker",
      area: "host",
      title: "Repair the GPU prerequisites for the packaged AI path",
      message:
        "Docker Desktop is available, but the packaged setup could not verify the NVIDIA tooling needed for the supported GPU-backed local AI route.",
      recovery: [
        "Repair the NVIDIA driver and WSL2 setup until nvidia-smi works in a normal terminal session.",
        "Retry the setup check after the GPU prerequisites are available."
      ],
      recommended_fix:
        "Repair the NVIDIA driver and WSL2 setup until nvidia-smi works in a normal terminal session.",
      env_vars: [],
      details: buildIssueDetails(context, {
        check: "desktop-shell-gpu",
        probe_target: "nvidia-smi"
      })
    });
  }

  return issues;
}

function shouldReportGpuToolingIssue(config: AppConfig, context: DesktopShellPreflightContext): boolean {
  const localGpuRequested = Boolean(config.runtime.local_gpu?.requested) || config.profile.recommendedAiStack === "local-gpu";
  return localGpuRequested && context.dockerState === "running" && context.gpuState === "tooling-missing";
}

function normalizeDockerState(value: string | undefined): DesktopShellDockerState | null {
  if (value === "missing" || value === "not-running" || value === "running") {
    return value;
  }

  return null;
}

function normalizeGpuState(value: string | undefined): DesktopShellGpuState | null {
  if (value === "tooling-missing" || value === "ready") {
    return value;
  }

  return null;
}

function splitNotes(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("||")
    .map((note) => note.trim())
    .filter(Boolean);
}

function buildIssueDetails(
  context: DesktopShellPreflightContext,
  details: RuntimePreflightIssueDetails
): RuntimePreflightIssueDetails {
  return {
    ...details,
    notes: context.notes.length ? [...context.notes] : details.notes
  };
}