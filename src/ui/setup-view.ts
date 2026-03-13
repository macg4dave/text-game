import type {
  RuntimeConfigDiagnostics,
  RuntimeConfigProfile,
  RuntimeLocalGpuSelection,
  SetupStatus
} from "./contracts.js";
import type {
  PreflightIssueViewModel,
  PreflightPanelRenderState,
  PreflightPanelViewModel,
  SetupWizardRenderState,
  SetupWizardViewModel
} from "./setup-view-model.js";
import {
  createPreflightIssueViewModel,
  createPreflightPanelViewModel,
  createSetupWizardViewModel,
  DEFAULT_LAUNCHER,
  DEFAULT_SERVICES,
  DEFAULT_SUPPORTED_SUMMARY,
  DEFAULT_SUPPORTED_TITLE
} from "./setup-view-model.js";
export {
  createPreflightIssueViewModel,
  createPreflightPanelViewModel,
  createSetupWizardViewModel
} from "./setup-view-model.js";
export type { PreflightIssueViewModel, PreflightPanelRenderState, PreflightPanelViewModel, SetupWizardRenderState, SetupWizardViewModel } from "./setup-view-model.js";
export type { SetupRecoveryActionId, SetupRecoveryActionViewModel } from "./setup-recovery-policy.js";

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
