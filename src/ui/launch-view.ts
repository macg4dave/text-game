import type { SetupStatus } from "./contracts.js";

export interface LaunchPanelElements {
  launchPanelEl: HTMLElement;
  launchNewGameButtonEl: HTMLButtonElement;
  launchResumeButtonEl: HTMLButtonElement;
  launchResumeNoteEl: HTMLElement;
}

export interface LaunchPanelRenderState {
  hasEnteredFlow: boolean;
  pending: boolean;
  fatalBlocked: boolean;
  hasSavedSession: boolean;
  setupStatus: SetupStatus | null;
}

export interface LaunchPanelViewModel {
  hidden: boolean;
  newGameDisabled: boolean;
  resumeDisabled: boolean;
  resumeNote: string;
}

export function createLaunchPanelViewModel(state: LaunchPanelRenderState): LaunchPanelViewModel {
  const resumeAvailable = state.hasSavedSession;
  const setupReady = state.setupStatus?.status === "ready";
  const setupKnown = Boolean(state.setupStatus);

  return {
    hidden: state.hasEnteredFlow || state.fatalBlocked,
    newGameDisabled: state.pending || state.fatalBlocked || !setupKnown || !setupReady,
    resumeDisabled: state.pending || state.fatalBlocked || !setupKnown || !setupReady || !resumeAvailable,
    resumeNote: !setupKnown
      ? "Finish the setup check before starting."
      : !setupReady
        ? "Fix the setup items below, then run the connection test again."
        : resumeAvailable
          ? "Resume uses the last game saved in this browser."
          : "No saved game is stored in this browser yet. Start a new game to begin."
  };
}

export function renderLaunchPanel(elements: LaunchPanelElements, state: LaunchPanelRenderState): void {
  const viewModel = createLaunchPanelViewModel(state);

  elements.launchPanelEl.hidden = viewModel.hidden;
  elements.launchNewGameButtonEl.disabled = viewModel.newGameDisabled;
  elements.launchResumeButtonEl.disabled = viewModel.resumeDisabled;
  elements.launchResumeNoteEl.textContent = viewModel.resumeNote;
}