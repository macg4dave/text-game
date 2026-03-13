import type { RuntimePreflightIssue, SetupStatus } from "./contracts.js";

export type SetupRecoveryActionId =
  | "retry-setup-check"
  | "copy-docker-desktop-checklist"
  | "copy-launcher-command"
  | "copy-smaller-profile-guidance"
  | "copy-gpu-repair-checklist";

export interface SetupRecoveryActionViewModel {
  id: SetupRecoveryActionId;
  label: string;
  description: string;
}

export interface RecoveryActionContext {
  canRetry: boolean;
  launcher: string | null;
  currentProfileId: string | null;
  localGpuRequested: boolean;
  hasProfileOverrides: boolean;
}

export function createRecoveryActionContext(
  setup: SetupStatus | null,
  fallbackLauncher: string
): RecoveryActionContext {
  const diagnostics = setup?.config_diagnostics as { profile_overrides?: unknown[] } | null | undefined;

  return {
    canRetry: setup?.can_retry ?? true,
    launcher: setup?.supported_path?.launcher || fallbackLauncher,
    currentProfileId: setup?.current_profile?.id || null,
    localGpuRequested: Boolean((setup?.local_gpu as { requested?: boolean } | null | undefined)?.requested),
    hasProfileOverrides: Array.isArray(diagnostics?.profile_overrides) && diagnostics.profile_overrides.length > 0
  };
}

export function buildRecoveryActions(
  issues: RuntimePreflightIssue[],
  context: RecoveryActionContext
): SetupRecoveryActionViewModel[] {
  const actions = new Map<SetupRecoveryActionId, SetupRecoveryActionViewModel>();
  const issueCodes = issues.map((issue) => issue.code);

  if (context.canRetry) {
    actions.set("retry-setup-check", {
      id: "retry-setup-check",
      label: "Retry setup check",
      description: "Run the connection test again without clearing the saved browser session."
    });
  }

  if (issueCodes.some((code) => ["docker_missing", "docker_not_running"].includes(code))) {
    actions.set("copy-docker-desktop-checklist", {
      id: "copy-docker-desktop-checklist",
      label: "Copy Docker Desktop checklist",
      description: "Copy the packaged-path Docker Desktop install and startup checklist."
    });
  }

  if (context.launcher && issues.length) {
    actions.set("copy-launcher-command", {
      id: "copy-launcher-command",
      label: "Copy launcher command",
      description: "Copy the supported launcher command so you can restart Docker Desktop, LiteLLM, and the GPU-backed Ollama path together."
    });
  }

  if (
    context.currentProfileId === "custom" ||
    context.currentProfileId === "local-gpu-large" ||
    context.hasProfileOverrides ||
    issueCodes.some((code) =>
      ["local_model_missing", "local_model_backend_unreachable", "ai_upstream_unhealthy", "profile_overrides_active"].includes(code)
    )
  ) {
    actions.set("copy-smaller-profile-guidance", {
      id: "copy-smaller-profile-guidance",
      label: "Copy smaller-profile guidance",
      description: "Copy the conservative local profile instructions for the next launcher run."
    });
  }

  if (
    context.localGpuRequested ||
    issueCodes.some((code) =>
      [
        "docker_not_running",
        "local_model_missing",
        "local_model_backend_unreachable",
        "gpu_tooling_not_detected",
        "docker_nvidia_runtime_missing"
      ].includes(code)
    )
  ) {
    actions.set("copy-gpu-repair-checklist", {
      id: "copy-gpu-repair-checklist",
      label: "Copy GPU repair checklist",
      description: "Copy the supported GPU-backed recovery checklist for Docker Desktop, NVIDIA, and local model availability."
    });
  }

  return Array.from(actions.values());
}