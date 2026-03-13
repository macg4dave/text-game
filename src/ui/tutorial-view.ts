export interface TutorialProgress {
  completedTurns: number;
  dismissed: boolean;
}

export interface TutorialPanelElements {
  panelEl: HTMLElement;
  titleEl: HTMLElement;
  summaryEl: HTMLElement;
  listEl: HTMLElement;
  footerEl: HTMLElement;
  dismissButtonEl: HTMLButtonElement;
}

export interface TutorialPanelRenderState {
  hasEnteredFlow: boolean;
  hasPlayer: boolean;
  setupBlocked: boolean;
  hasSavedSession: boolean;
  progress: TutorialProgress;
}

export interface TutorialTip {
  title: string;
  description: string;
}

export interface TutorialViewModel {
  hidden: boolean;
  title: string;
  summary: string;
  tips: TutorialTip[];
  footer: string;
}

const TUTORIAL_TURN_COUNT_KEY = "tutorialTurnCount";
const TUTORIAL_DISMISSED_KEY = "tutorialDismissed";
const COMPLETION_THRESHOLD = 3;

export function readTutorialProgress(storage: Storage): TutorialProgress {
  const storedCount = Number.parseInt(storage.getItem(TUTORIAL_TURN_COUNT_KEY) || "0", 10);
  return {
    completedTurns: Number.isFinite(storedCount) && storedCount > 0 ? storedCount : 0,
    dismissed: storage.getItem(TUTORIAL_DISMISSED_KEY) === "true"
  };
}

export function writeTutorialProgress(storage: Storage, progress: TutorialProgress): TutorialProgress {
  const normalized = {
    completedTurns: Math.max(0, Math.floor(progress.completedTurns)),
    dismissed: Boolean(progress.dismissed)
  };

  storage.setItem(TUTORIAL_TURN_COUNT_KEY, String(normalized.completedTurns));
  if (normalized.dismissed) {
    storage.setItem(TUTORIAL_DISMISSED_KEY, "true");
  } else {
    storage.removeItem(TUTORIAL_DISMISSED_KEY);
  }

  return normalized;
}

export function incrementTutorialTurns(storage: Storage, progress: TutorialProgress): TutorialProgress {
  return writeTutorialProgress(storage, {
    completedTurns: progress.completedTurns + 1,
    dismissed: progress.dismissed || progress.completedTurns + 1 >= COMPLETION_THRESHOLD
  });
}

export function dismissTutorial(storage: Storage, progress: TutorialProgress): TutorialProgress {
  return writeTutorialProgress(storage, {
    completedTurns: progress.completedTurns,
    dismissed: true
  });
}

export function createTutorialViewModel(state: TutorialPanelRenderState): TutorialViewModel {
  if (!state.hasEnteredFlow || state.progress.dismissed || state.progress.completedTurns >= COMPLETION_THRESHOLD) {
    return hiddenViewModel();
  }

  if (!state.hasPlayer) {
    return {
      hidden: false,
      title: "Opening scene incoming",
      summary: "The game is getting your first scene ready. Once the story appears, try one short action to get your bearings.",
      tips: [
        {
          title: "Start small",
          description: "Good first moves are things like \"look around\", \"inspect the room\", or \"check the radio\"."
        },
        {
          title: "Use plain language",
          description: "Suggestion buttons are shortcuts, not commands you must follow. Type the move you actually want to try."
        },
        {
          title: "Keep recovery visible",
          description: state.setupBlocked
            ? "If setup needs attention again, the repair and retry actions stay above this guide."
            : "Save and setup recovery actions stay in the same play screen, so you do not need to leave the app."
        }
      ],
      footer: "This guide fades out after your first few successful turns."
    };
  }

  if (state.progress.completedTurns === 0) {
    return {
      hidden: false,
      title: "First three turns",
      summary: "Start with one short action, then watch how the story answers and what options it suggests next.",
      tips: [
        {
          title: "Get your bearings",
          description: "Try \"look around\", \"inspect the area\", or another quick read-the-room move first."
        },
        {
          title: "Use any wording you like",
          description: "You can click a suggested option or type your own move. Freeform input is the main path, not a backup."
        },
        {
          title: "Do not lose a good checkpoint",
          description: "Use Save Current Game after a promising scene. Refresh rereads the live session, and New Game starts a fresh run."
        }
      ],
      footer: state.hasSavedSession
        ? "You can still return to the browser-saved session from the launch screen later."
        : "If setup or AI readiness slips, the retry and repair actions remain above the play log."
    };
  }

  if (state.progress.completedTurns === 1) {
    return {
      hidden: false,
      title: "Nice — now vary your moves",
      summary: "The story can handle more than one kind of action, so try changing your approach on this turn.",
      tips: [
        {
          title: "Switch verbs",
          description: "Move somewhere, talk to someone, inspect an object, or use an item instead of repeating the same action shape."
        },
        {
          title: "Read the latest answer first",
          description: "The log is the source for what just changed. Suggested buttons are there to jog ideas, not to lock you into one route."
        },
        {
          title: "Refresh is safe",
          description: "If the screen feels stale, Refresh asks the app for the current live state without wiping the run."
        }
      ],
      footer: "One more turn and this guide will shrink even further."
    };
  }

  return {
    hidden: false,
    title: "Last quick pointer",
    summary: "You are nearly out of tutorial mode. The last thing worth building early is a checkpoint habit.",
    tips: [
      {
        title: "Save before experiments",
        description: "Create a named save before you try something risky or before a scene feels important."
      },
      {
        title: "Know your recovery buttons",
        description: "Resume Last Game returns to the browser-saved session, while New Game intentionally starts over."
      },
      {
        title: "Setup help stays in the same screen",
        description: "If the AI path needs a retry later, the setup panel still carries the plain-language repair steps."
      }
    ],
    footer: "After your next successful turn, this guide steps out of the way."
  };
}

export function renderTutorialPanel(elements: TutorialPanelElements, state: TutorialPanelRenderState): void {
  const viewModel = createTutorialViewModel(state);

  elements.panelEl.hidden = viewModel.hidden;
  elements.dismissButtonEl.hidden = viewModel.hidden;
  if (viewModel.hidden) {
    elements.titleEl.textContent = "";
    elements.summaryEl.textContent = "";
    elements.listEl.innerHTML = "";
    elements.footerEl.textContent = "";
    return;
  }

  elements.titleEl.textContent = viewModel.title;
  elements.summaryEl.textContent = viewModel.summary;
  elements.listEl.innerHTML = "";
  viewModel.tips.forEach((tip) => {
    const item = document.createElement("li");

    const title = document.createElement("strong");
    title.textContent = tip.title;

    const description = document.createElement("p");
    description.textContent = tip.description;

    item.appendChild(title);
    item.appendChild(description);
    elements.listEl.appendChild(item);
  });
  elements.footerEl.textContent = viewModel.footer;
}

function hiddenViewModel(): TutorialViewModel {
  return {
    hidden: true,
    title: "",
    summary: "",
    tips: [],
    footer: ""
  };
}
