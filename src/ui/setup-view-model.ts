import type {
  RuntimeConfigDiagnostics,
  RuntimeConfigProfile,
  RuntimeLocalGpuSelection,
  RuntimePreflightIssue,
  RuntimePreflightPayload,
  SetupStatus
} from "./contracts.js";
import { formatLocalGpuSummary } from "./session-data.js";
import {
  buildRecoveryActions,
  createRecoveryActionContext,
  type SetupRecoveryActionViewModel
} from "./setup-recovery-policy.js";

export interface SetupWizardRenderState {
  setupStatus: SetupStatus | null;
  setupError: string | null;
  pending: boolean;
  fatalBlocked: boolean;
}

export interface SetupWizardViewModel {
  title: string;
  summary: string;
  currentProfileText: string;
  buttonText: string;
  supportedTitle: string;
  supportedSummary: string;
  launcher: string;
  services: string[];
  guidance: string[];
  actions: SetupRecoveryActionViewModel[];
  advancedJson: string | null;
}

export interface PreflightPanelRenderState {
  preflight: RuntimePreflightPayload | null;
  diagnostics: RuntimeConfigDiagnostics | null;
  profile: RuntimeConfigProfile | null;
  setupStatus: SetupStatus | null;
  localGpu: RuntimeLocalGpuSelection | null;
}

export interface PreflightIssueViewModel {
  text: string;
  advancedIssue: Record<string, unknown> | null;
  severity: string | null;
  title: string;
  message: string;
  recommendedFix: string | null;
  advancedJson: string | null;
  actions: SetupRecoveryActionViewModel[];
}

export interface PreflightPanelViewModel {
  hidden: boolean;
  title: string;
  summary: string;
  profileText: string;
  issueItems: PreflightIssueViewModel[];
  advancedJson: string | null;
}

export const DEFAULT_SUPPORTED_TITLE = "Supported MVP AI path";
export const DEFAULT_SUPPORTED_SUMMARY =
  "Use Docker Desktop so the app can reach the repo-managed LiteLLM sidecar and the supported GPU-backed Ollama route. Retry from the setup panel if either service is still starting.";
export const DEFAULT_LAUNCHER = "cargo run --manifest-path launcher/Cargo.toml -- start-dev";
export const DEFAULT_SERVICES = ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"];

export function createSetupWizardViewModel(state: SetupWizardRenderState): SetupWizardViewModel {
  const setup = state.setupStatus;
  const preflight = setup?.preflight;
  const currentProfile = setup?.current_profile;
  const supportedPath = setup?.supported_path;
  const issues = preflight?.issues || [];
  const guidance: string[] = [];
  const recoveryContext = createRecoveryActionContext(setup, DEFAULT_LAUNCHER);

  if (state.setupError) {
    guidance.push(
      "The app could not refresh the setup status. Retry the connection test. If this keeps happening, restart the launcher."
    );

    return {
      title: "Setup check failed",
      summary: state.setupError,
      currentProfileText: "Retry the connection test to refresh the supported path checks.",
      buttonText: "Retry Setup Check",
      supportedTitle: supportedPath?.title || DEFAULT_SUPPORTED_TITLE,
      supportedSummary: supportedPath?.summary || DEFAULT_SUPPORTED_SUMMARY,
      launcher: supportedPath?.launcher || DEFAULT_LAUNCHER,
      services: supportedPath?.services || DEFAULT_SERVICES,
      guidance,
      actions: buildRecoveryActions([], recoveryContext),
      advancedJson: null
    };
  }

  if (!setup) {
    guidance.push("You can start or resume after the setup check finishes.");

    return {
      title: "Checking the supported AI path",
      summary: "The app is checking Docker, LiteLLM, and the supported local AI route before the first turn.",
      currentProfileText: "Loading the current profile and connection details.",
      buttonText: "Run Connection Test",
      supportedTitle: DEFAULT_SUPPORTED_TITLE,
      supportedSummary: DEFAULT_SUPPORTED_SUMMARY,
      launcher: DEFAULT_LAUNCHER,
      services: DEFAULT_SERVICES,
      guidance,
      actions: buildRecoveryActions([], {
        canRetry: true,
        launcher: DEFAULT_LAUNCHER,
        currentProfileId: null,
        localGpuRequested: false,
        hasProfileOverrides: false
      }),
      advancedJson: null
    };
  }

  if (issues.length) {
    issues.forEach((issue) => {
      const recommendedFix = issue.recommended_fix || issue.recovery?.[0];
      guidance.push(
        recommendedFix
          ? `${issue.title || "Setup issue"}: ${recommendedFix}`
          : `${issue.title || "Setup issue"}: ${issue.message || "Review the setup details and retry."}`
      );
    });
  } else {
    guidance.push("The supported AI path is ready. Start a new game or resume when you are ready.");
  }

  return {
    title:
      setup.status === "ready"
        ? "Connection test passed"
        : setup.status === "checking"
          ? "Checking setup"
          : "Setup needs attention",
    summary: setup.summary || "Run the setup check before the first turn.",
    currentProfileText: currentProfile
      ? `Current profile: ${currentProfile.label || currentProfile.id || "Unknown"} via ${currentProfile.provider || "unknown provider"}. Chat: ${currentProfile.chat_model || "unknown"}, embeddings: ${currentProfile.embedding_model || "unknown"}.`
      : "Current profile details are not available yet.",
    buttonText: setup.status === "action-required" || setup.checked_at ? "Retry Setup Check" : "Run Connection Test",
    supportedTitle: supportedPath?.title || DEFAULT_SUPPORTED_TITLE,
    supportedSummary: supportedPath?.summary || DEFAULT_SUPPORTED_SUMMARY,
    launcher: supportedPath?.launcher || DEFAULT_LAUNCHER,
    services: supportedPath?.services || DEFAULT_SERVICES,
    guidance,
    actions: buildRecoveryActions(issues, recoveryContext),
    advancedJson: JSON.stringify(
      {
        status: setup.status,
        summary: setup.summary,
        checked_at: setup.checked_at,
        current_profile: setup.current_profile,
        supported_path: setup.supported_path,
        config_diagnostics: setup.config_diagnostics || null,
        local_gpu: setup.local_gpu || null,
        issues: issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          area: issue.area,
          title: issue.title,
          message: issue.message,
          env_vars: issue.env_vars,
          details: issue.details || null
        }))
      },
      null,
      2
    )
  };
}

export function createPreflightPanelViewModel(state: PreflightPanelRenderState): PreflightPanelViewModel {
  const preflight = state.preflight;
  if (!preflight || (preflight.ok && !(preflight.issues || []).length)) {
    return {
      hidden: true,
      title: "",
      summary: "",
      profileText: "",
      issueItems: [],
      advancedJson: null
    };
  }

  const profileLabel =
    state.diagnostics?.profile?.label || state.profile?.label || state.setupStatus?.current_profile?.label || "Setup profile";
  const overrideCount = state.diagnostics?.profile_overrides?.length || 0;
  const localGpuSummary = formatLocalGpuSummary(state.localGpu);
  const issueItems = (preflight.issues || []).map(createPreflightIssueViewModel);
  const advancedIssues = (preflight.issues || []).map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    area: issue.area,
    title: issue.title,
    message: issue.message,
    env_vars: issue.env_vars,
    details: issue.details || null
  }));

  return {
    hidden: false,
    title: preflight.status === "checking" ? "Checking setup" : "Setup required",
    summary: preflight.summary || "The app needs setup changes before the first turn.",
    profileText: overrideCount
      ? `${profileLabel} with ${overrideCount} advanced override${overrideCount === 1 ? "" : "s"}.${localGpuSummary ? ` ${localGpuSummary}.` : ""}`
      : `${profileLabel} is active.${localGpuSummary ? ` ${localGpuSummary}.` : ""}`,
    issueItems,
    advancedJson: advancedIssues.length
      ? JSON.stringify(
          {
            status: preflight.status || null,
            summary: preflight.summary || null,
            profile: {
              label: profileLabel,
              overrides: state.diagnostics?.profile_overrides || [],
              local_gpu: state.localGpu || null
            },
            diagnostics: state.diagnostics || null,
            issues: advancedIssues
          },
          null,
          2
        )
      : null
  };
}

export function createPreflightIssueViewModel(issue: RuntimePreflightIssue): PreflightIssueViewModel {
  const severity = typeof issue.severity === "string" ? `[${issue.severity.toUpperCase()}] ` : "";
  const parts = [issue.title, issue.message].filter((value): value is string => Boolean(value));
  const recovery = Array.isArray(issue.recovery) ? issue.recovery.filter(Boolean) : [];
  const recommendedFix = issue.recommended_fix || recovery[0] || "";
  const advancedIssue =
    issue.details || (issue.env_vars && issue.env_vars.length)
      ? {
          code: issue.code || null,
          area: issue.area || null,
          title: issue.title || null,
          severity: issue.severity || null,
          env_vars: issue.env_vars || [],
          details: issue.details ? { ...issue.details } : null
        }
      : null;

  return {
    text: recommendedFix
      ? `${severity}${parts.join(": ")} Recommended next step: ${recommendedFix}`
      : `${severity}${parts.join(": ")}`,
    advancedIssue,
    severity: issue.severity || null,
    title: issue.title || "Setup issue",
    message: issue.message || "Review the setup details and retry.",
    recommendedFix: recommendedFix || null,
    advancedJson: advancedIssue ? JSON.stringify(advancedIssue, null, 2) : null,
    actions: buildRecoveryActions([issue], {
      canRetry: true,
      launcher: DEFAULT_LAUNCHER,
      currentProfileId: null,
      localGpuRequested: false,
      hasProfileOverrides: false
    })
  };
}