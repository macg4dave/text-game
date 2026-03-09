import type {
  RuntimeConfigDiagnostics,
  RuntimeConfigProfile,
  RuntimeLocalGpuSelection,
  RuntimePreflightIssue,
  RuntimePreflightPayload,
  SetupStatus
} from "./contracts.js";
import { formatLocalGpuSummary } from "./session-data.js";

export interface SetupWizardElements {
  setupTitleEl: HTMLElement;
  setupSummaryEl: HTMLElement;
  setupCheckButtonEl: HTMLButtonElement;
  setupCurrentProfileEl: HTMLElement;
  setupSupportedTitleEl: HTMLElement;
  setupSupportedSummaryEl: HTMLElement;
  setupLauncherEl: HTMLElement;
  setupServicesEl: HTMLElement;
  setupGuidanceEl: HTMLElement;
  setupActionsEl: HTMLElement;
  setupAdvancedEl: HTMLDetailsElement;
  setupAdvancedJsonEl: HTMLElement;
}

export interface PreflightPanelElements {
  preflightPanelEl: HTMLElement;
  preflightTitleEl: HTMLElement;
  preflightSummaryEl: HTMLElement;
  preflightProfileEl: HTMLElement;
  preflightIssuesEl: HTMLElement;
  preflightAdvancedEl: HTMLDetailsElement;
  preflightAdvancedJsonEl: HTMLElement;
}

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

export type SetupRecoveryActionId =
  | "retry-setup-check"
  | "copy-launcher-command"
  | "copy-smaller-profile-guidance"
  | "copy-gpu-repair-checklist";

export interface SetupRecoveryActionViewModel {
  id: SetupRecoveryActionId;
  label: string;
  description: string;
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

const DEFAULT_SUPPORTED_TITLE = "Supported MVP AI path";
const DEFAULT_SUPPORTED_SUMMARY =
  "Use the Windows launcher with Docker Desktop so the app, LiteLLM, and the GPU-backed Ollama route start together.";
const DEFAULT_LAUNCHER = "cargo run --manifest-path launcher/Cargo.toml -- start-dev";
const DEFAULT_SERVICES = ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"];

interface RecoveryActionContext {
  canRetry: boolean;
  launcher: string | null;
  currentProfileId: string | null;
  localGpuRequested: boolean;
  hasProfileOverrides: boolean;
}

export function createSetupWizardViewModel(state: SetupWizardRenderState): SetupWizardViewModel {
  const setup = state.setupStatus;
  const preflight = setup?.preflight;
  const currentProfile = setup?.current_profile;
  const supportedPath = setup?.supported_path;
  const issues = preflight?.issues || [];
  const guidance: string[] = [];
  const recoveryContext = createRecoveryActionContext(setup);

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

export function renderSetupWizard(elements: SetupWizardElements, state: SetupWizardRenderState): void {
  const viewModel = createSetupWizardViewModel(state);

  elements.setupCheckButtonEl.disabled = state.pending || state.fatalBlocked;
  elements.setupCheckButtonEl.textContent = viewModel.buttonText;
  elements.setupTitleEl.textContent = viewModel.title;
  elements.setupSummaryEl.textContent = viewModel.summary;
  elements.setupCurrentProfileEl.textContent = viewModel.currentProfileText;
  elements.setupSupportedTitleEl.textContent = viewModel.supportedTitle;
  elements.setupSupportedSummaryEl.textContent = viewModel.supportedSummary;
  elements.setupLauncherEl.textContent = viewModel.launcher;
  elements.setupServicesEl.innerHTML = "";
  viewModel.services.forEach((service) => {
    const item = document.createElement("li");
    item.textContent = service;
    elements.setupServicesEl.appendChild(item);
  });

  elements.setupGuidanceEl.innerHTML = "";
  viewModel.guidance.forEach((guidance) => {
    const item = document.createElement("li");
    item.textContent = guidance;
    elements.setupGuidanceEl.appendChild(item);
  });

  elements.setupActionsEl.innerHTML = "";
  elements.setupActionsEl.hidden = viewModel.actions.length === 0;
  viewModel.actions.forEach((action) => {
    const card = document.createElement("div");
    card.className = "setup-action";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.dataset.recoveryAction = action.id;
    button.textContent = action.label;

    const description = document.createElement("p");
    description.textContent = action.description;

    card.appendChild(button);
    card.appendChild(description);
    elements.setupActionsEl.appendChild(card);
  });

  elements.setupAdvancedEl.hidden = !viewModel.advancedJson;
  if (!viewModel.advancedJson) {
    elements.setupAdvancedEl.open = false;
    elements.setupAdvancedJsonEl.textContent = "";
  } else {
    elements.setupAdvancedJsonEl.textContent = viewModel.advancedJson;
  }
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

export function renderPreflightPanel(elements: PreflightPanelElements, state: PreflightPanelRenderState): void {
  const viewModel = createPreflightPanelViewModel(state);

  if (viewModel.hidden) {
    elements.preflightPanelEl.hidden = true;
    elements.preflightSummaryEl.textContent = "";
    elements.preflightProfileEl.textContent = "";
    elements.preflightIssuesEl.innerHTML = "";
    elements.preflightAdvancedEl.hidden = true;
    elements.preflightAdvancedEl.open = false;
    elements.preflightAdvancedJsonEl.textContent = "";
    return;
  }

  elements.preflightPanelEl.hidden = false;
  elements.preflightTitleEl.textContent = viewModel.title;
  elements.preflightSummaryEl.textContent = viewModel.summary;
  elements.preflightProfileEl.textContent = viewModel.profileText;
  elements.preflightIssuesEl.innerHTML = "";
  viewModel.issueItems.forEach((issue) => {
    const item = document.createElement("li");
    item.className = "preflight-issue";

    const header = document.createElement("div");
    header.className = "preflight-issue-header";

    const badge = document.createElement("span");
    badge.className = "preflight-badge";
    if (issue.severity) {
      badge.dataset.severity = issue.severity;
      badge.textContent = issue.severity;
    }

    const title = document.createElement("strong");
    title.textContent = issue.title;

    header.appendChild(badge);
    header.appendChild(title);
    item.appendChild(header);

    const copy = document.createElement("p");
    copy.className = "preflight-issue-copy";
    copy.textContent = issue.message;
    item.appendChild(copy);

    if (issue.recommendedFix) {
      const fix = document.createElement("p");
      fix.className = "preflight-issue-fix";
      fix.textContent = `Recommended next step: ${issue.recommendedFix}`;
      item.appendChild(fix);
    }

    if (issue.actions.length) {
      const actions = document.createElement("div");
      actions.className = "preflight-issue-actions";
      issue.actions.forEach((action) => {
        const card = document.createElement("div");
        card.className = "setup-action";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.dataset.recoveryAction = action.id;
        button.textContent = action.label;

        const description = document.createElement("p");
        description.textContent = action.description;

        card.appendChild(button);
        card.appendChild(description);
        actions.appendChild(card);
      });
      item.appendChild(actions);
    }

    if (issue.advancedJson) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Advanced issue details";
      const pre = document.createElement("pre");
      pre.textContent = issue.advancedJson;
      details.appendChild(summary);
      details.appendChild(pre);
      item.appendChild(details);
    }

    elements.preflightIssuesEl.appendChild(item);
  });

  if (viewModel.advancedJson) {
    elements.preflightAdvancedEl.hidden = false;
    elements.preflightAdvancedJsonEl.textContent = viewModel.advancedJson;
    return;
  }

  elements.preflightAdvancedEl.hidden = true;
  elements.preflightAdvancedEl.open = false;
  elements.preflightAdvancedJsonEl.textContent = "";
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

function createRecoveryActionContext(setup: SetupStatus | null): RecoveryActionContext {
  const diagnostics = setup?.config_diagnostics as { profile_overrides?: unknown[] } | null | undefined;
  return {
    canRetry: setup?.can_retry ?? true,
    launcher: setup?.supported_path?.launcher || DEFAULT_LAUNCHER,
    currentProfileId: setup?.current_profile?.id || null,
    localGpuRequested: Boolean((setup?.local_gpu as { requested?: boolean } | null | undefined)?.requested),
    hasProfileOverrides: Array.isArray(diagnostics?.profile_overrides) && diagnostics.profile_overrides.length > 0
  };
}

function buildRecoveryActions(
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
