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
const DEFAULT_LAUNCHER = "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1";
const DEFAULT_SERVICES = ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"];

export function createSetupWizardViewModel(state: SetupWizardRenderState): SetupWizardViewModel {
  const setup = state.setupStatus;
  const preflight = setup?.preflight;
  const currentProfile = setup?.current_profile;
  const supportedPath = setup?.supported_path;
  const issues = preflight?.issues || [];
  const guidance: string[] = [];

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
      guidance
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
      guidance
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
    guidance
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
  const advancedIssues = issueItems
    .map((item) => item.advancedIssue)
    .filter((issue): issue is Record<string, unknown> => Boolean(issue));

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
    item.textContent = issue.text;
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

  return {
    text: recommendedFix
      ? `${severity}${parts.join(": ")} Recommended next step: ${recommendedFix}`
      : `${severity}${parts.join(": ")}`,
    advancedIssue:
      issue.details || (issue.env_vars && issue.env_vars.length)
        ? {
            title: issue.title || null,
            severity: issue.severity || null,
            env_vars: issue.env_vars || [],
            details: issue.details || null
          }
        : null
  };
}
