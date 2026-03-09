import { createFatalUiErrorState, registerGlobalErrorHandlers, type FatalUiErrorState } from "./global-error.js";
import {
  type RuntimeConfigDiagnostics,
  type RuntimeConfigProfile,
  type RuntimeLocalGpuSelection,
  type RuntimePreflightPayload
} from "./contracts.js";
import { createInitialAppState, hasSavedSession } from "./app-state.js";
import { getElement } from "./dom.js";
import { renderDebugPanels as renderDebugView } from "./debug-view.js";
import { fetchJson, formatErrorMessage } from "./http-client.js";
import { renderLaunchPanel as renderLaunchView } from "./launch-view.js";
import { getStoredPlayerName, rememberPlayerName as persistPlayerName } from "./player-name.js";
import { runRecoveryAction } from "./recovery-actions.js";
import { renderSaveSlotsPanel as renderSaveSlotsView } from "./save-slots-view.js";
import {
  getRuntimeConfigDiagnostics as selectRuntimeConfigDiagnostics,
  getRuntimeLocalGpuSelection as selectRuntimeLocalGpuSelection,
  getRuntimePreflight as selectRuntimePreflight,
  getRuntimeProfile as selectRuntimeProfile
} from "./session-data.js";
import { createSessionController } from "./session-controller.js";
import { renderPreflightPanel as renderPreflightView, renderSetupWizard as renderSetupView } from "./setup-view.js";
import {
  appendLogEntry,
  renderAssistChips,
  renderSessionSummary as renderTurnSurfaceSummary,
  renderTurnOptions
} from "./turn-surface.js";

let activeFatalUiError: FatalUiErrorState | null = null;

registerGlobalErrorHandlers(window, renderAppFatalError);

try {
  initializeApp();
} catch (error) {
  renderAppFatalError(createFatalUiErrorState(error));
}

function initializeApp(): void {
  const logEl = getElement<HTMLElement>("log");
  const formEl = getElement<HTMLFormElement>("input-form");
  const nameEl = getElement<HTMLInputElement>("player-name");
  const inputEl = getElement<HTMLTextAreaElement>("player-input");
  const sendButtonEl = getElement<HTMLButtonElement>("send-button");
  const optionsEl = getElement<HTMLElement>("options");
  const assistEl = getElement<HTMLElement>("assist");
  const statusPillEl = getElement<HTMLElement>("status-pill");
  const preflightPanelEl = getElement<HTMLElement>("preflight-panel");
  const preflightTitleEl = getElement<HTMLElement>("preflight-title");
  const preflightSummaryEl = getElement<HTMLElement>("preflight-summary");
  const preflightProfileEl = getElement<HTMLElement>("preflight-profile");
  const preflightIssuesEl = getElement<HTMLElement>("preflight-issues");
  const preflightAdvancedEl = getElement<HTMLDetailsElement>("preflight-advanced");
  const preflightAdvancedJsonEl = getElement<HTMLElement>("preflight-advanced-json");
  const runtimeSummaryEl = getElement<HTMLElement>("runtime-summary");
  const sessionSummaryEl = getElement<HTMLElement>("session-summary");
  const profileSummaryEl = getElement<HTMLElement>("profile-summary");
  const connectionDebugEl = getElement<HTMLElement>("connection-debug");
  const stateDebugEl = getElement<HTMLElement>("state-debug");
  const turnDebugEl = getElement<HTMLElement>("turn-debug");
  const refreshSessionButtonEl = getElement<HTMLButtonElement>("refresh-session");
  const newSessionButtonEl = getElement<HTMLButtonElement>("new-session");
  const sessionToolbarEl = getElement<HTMLElement>("session-toolbar");
  const launchPanelEl = getElement<HTMLElement>("launch-panel");
  const launchNewGameButtonEl = getElement<HTMLButtonElement>("launch-new-game");
  const launchResumeButtonEl = getElement<HTMLButtonElement>("launch-resume");
  const launchResumeNoteEl = getElement<HTMLElement>("launch-resume-note");
  const actionFieldEl = getElement<HTMLElement>("action-field");
  const saveSlotsPanelEl = getElement<HTMLElement>("save-slots-panel");
  const saveSlotsSummaryEl = getElement<HTMLElement>("save-slots-summary");
  const saveSlotsErrorEl = getElement<HTMLElement>("save-slots-error");
  const saveSlotsListEl = getElement<HTMLElement>("save-slots-list");
  const saveSlotLabelEl = getElement<HTMLInputElement>("save-slot-label");
  const saveSlotCreateButtonEl = getElement<HTMLButtonElement>("save-slot-create");
  const setupTitleEl = getElement<HTMLElement>("setup-title");
  const setupSummaryEl = getElement<HTMLElement>("setup-summary");
  const setupCheckButtonEl = getElement<HTMLButtonElement>("setup-check-button");
  const setupCurrentProfileEl = getElement<HTMLElement>("setup-current-profile");
  const setupSupportedTitleEl = getElement<HTMLElement>("setup-supported-title");
  const setupSupportedSummaryEl = getElement<HTMLElement>("setup-supported-summary");
  const setupLauncherEl = getElement<HTMLElement>("setup-launcher");
  const setupServicesEl = getElement<HTMLElement>("setup-services");
  const setupGuidanceEl = getElement<HTMLElement>("setup-guidance");
  const setupActionsEl = getElement<HTMLElement>("setup-actions");
  const setupAdvancedEl = getElement<HTMLDetailsElement>("setup-advanced");
  const setupAdvancedJsonEl = getElement<HTMLElement>("setup-advanced-json");

  const state = createInitialAppState({
    playerId: localStorage.getItem("playerId") || "",
    playerName: getStoredPlayerName(localStorage),
    fatalError: activeFatalUiError
  });

  nameEl.value = state.playerName;

  function addEntry(label: string, text: string, tone = "neutral"): void {
    appendLogEntry(logEl, { label, text, tone });
  }

  function clearLog(): void {
    logEl.innerHTML = "";
  }

  function setStatus(text: string, tone = "idle"): void {
    statusPillEl.textContent = text;
    statusPillEl.dataset.tone = tone;
  }

  function getRuntimePreflight(): RuntimePreflightPayload | null {
    return selectRuntimePreflight(state.setupStatus, state.sessionDebug, state.lastTurnDebug);
  }

  function getRuntimeConfigDiagnostics(): RuntimeConfigDiagnostics | null {
    return selectRuntimeConfigDiagnostics(state.sessionDebug, state.lastTurnDebug);
  }

  function getRuntimeProfile(): RuntimeConfigProfile | null {
    return selectRuntimeProfile(state.sessionDebug, state.lastTurnDebug);
  }

  function getRuntimeLocalGpuSelection(): RuntimeLocalGpuSelection | null {
    return selectRuntimeLocalGpuSelection(state.sessionDebug, state.lastTurnDebug);
  }

  function renderLaunchPanel(): void {
    renderLaunchView(
      {
        launchPanelEl,
        launchNewGameButtonEl,
        launchResumeButtonEl,
        launchResumeNoteEl
      },
      {
        hasEnteredFlow: state.hasEnteredFlow,
        pending: state.pending,
        fatalBlocked: Boolean(state.fatalError || activeFatalUiError),
        hasSavedSession: hasSavedSession(state),
        setupStatus: state.setupStatus
      }
    );
  }

  function renderSetupWizard(): void {
    renderSetupView(
      {
        setupTitleEl,
        setupSummaryEl,
        setupCheckButtonEl,
        setupCurrentProfileEl,
        setupSupportedTitleEl,
        setupSupportedSummaryEl,
        setupLauncherEl,
        setupServicesEl,
        setupGuidanceEl,
        setupActionsEl,
        setupAdvancedEl,
        setupAdvancedJsonEl
      },
      {
        setupStatus: state.setupStatus,
        setupError: state.setupError,
        pending: state.pending,
        fatalBlocked: Boolean(state.fatalError || activeFatalUiError)
      }
    );
  }

  function renderPlaySurface(): void {
    const showPlaySurface = state.hasEnteredFlow || Boolean(state.player || state.sessionDebug || state.lastTurnDebug);

    sessionToolbarEl.hidden = !showPlaySurface;
    logEl.hidden = !showPlaySurface;
    actionFieldEl.hidden = !showPlaySurface;
    sendButtonEl.hidden = !showPlaySurface;
    assistEl.hidden = !showPlaySurface;
    optionsEl.hidden = !showPlaySurface;
  }

  function renderSaveSlots(): void {
    renderSaveSlotsView(
      {
        panelEl: saveSlotsPanelEl,
        summaryEl: saveSlotsSummaryEl,
        errorEl: saveSlotsErrorEl,
        listEl: saveSlotsListEl,
        labelInputEl: saveSlotLabelEl,
        createButtonEl: saveSlotCreateButtonEl
      },
      {
        slots: state.saveSlots,
        saveSlotsError: state.saveSlotsError,
        setupStatus: state.setupStatus,
        pending: state.pending,
        fatalBlocked: Boolean(state.fatalError || activeFatalUiError),
        hasEnteredFlow: state.hasEnteredFlow,
        hasCurrentPlayer: Boolean(state.player),
        currentSaveSlotId: state.currentSaveSlotId
      }
    );
  }

  const sessionController = createSessionController({
    state,
    storage: localStorage,
    getActiveFatalUiError: () => activeFatalUiError,
    getPlayerNameInput: () => nameEl.value,
    setPlayerNameInput(value) {
      nameEl.value = value;
    },
    getSaveSlotLabelInput: () => saveSlotLabelEl.value,
    setSaveSlotLabelInput(value) {
      saveSlotLabelEl.value = value;
    },
    getTurnInput: () => inputEl.value,
    setTurnInput(value) {
      inputEl.value = value;
    },
    rememberPlayerName,
    setStatus,
    setPending,
    addEntry,
    setAssist,
    setOptions,
    clearLog,
    render: syncView,
    focusInput() {
      inputEl.focus();
    },
    focusName() {
      nameEl.focus();
    },
    getRuntimePreflight,
    fetchJson,
    formatErrorMessage
  });

  function setOptions(options: string[] = []): void {
    renderTurnOptions(optionsEl, {
      options,
      disabled: state.pending || Boolean(state.fatalError || activeFatalUiError),
      onSelect(option) {
        inputEl.value = option;
        inputEl.focus();
        sessionController.requestAssist().catch(() => {
          setAssist([], []);
        });
      }
    });
  }

  function setAssist(
    corrections: Array<{ token: string; suggestions: string[] }> = [],
    completions: string[] = []
  ): void {
    renderAssistChips(assistEl, {
      corrections,
      completions,
      onCorrectionSelect(token, suggestion) {
        replaceToken(token, suggestion);
        sessionController.requestAssist().catch(() => {
          setAssist([], []);
        });
      },
      onCompletionSelect(word) {
        applyCompletion(word);
        sessionController.requestAssist().catch(() => {
          setAssist([], []);
        });
      }
    });
  }

  function rememberPlayerName(): void {
    state.playerName = persistPlayerName(localStorage, nameEl.value);
  }

  function replaceToken(token: string, replacement: string): void {
    const safeToken = escapeRegExp(token);
    const regex = new RegExp(`\\b${safeToken}\\b`);
    inputEl.value = inputEl.value.replace(regex, replacement);
    inputEl.focus();
  }

  function applyCompletion(completion: string): void {
    inputEl.value = inputEl.value.replace(/[A-Za-z']+$/, completion);
    inputEl.focus();
  }

  function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderDebugPanels(): void {
    renderDebugView(
      {
        connectionDebugEl,
        stateDebugEl,
        turnDebugEl
      },
      {
        setupStatus: state.setupStatus,
        sessionDebug: state.sessionDebug,
        lastTurnDebug: state.lastTurnDebug,
        player: state.player,
        fatalError: state.fatalError,
        activeFatalUiError
      }
    );
  }

  function renderPreflightPanel(): void {
    renderPreflightView(
      {
        preflightPanelEl,
        preflightTitleEl,
        preflightSummaryEl,
        preflightProfileEl,
        preflightIssuesEl,
        preflightAdvancedEl,
        preflightAdvancedJsonEl
      },
      {
        preflight: getRuntimePreflight(),
        diagnostics: getRuntimeConfigDiagnostics(),
        profile: getRuntimeProfile(),
        setupStatus: state.setupStatus,
        localGpu: getRuntimeLocalGpuSelection()
      }
    );
  }

  function renderSessionSummary(): void {
    renderTurnSurfaceSummary(
      {
        runtimeSummaryEl,
        sessionSummaryEl,
        profileSummaryEl
      },
      {
        player: state.player,
        sessionDebug: state.sessionDebug,
        lastTurnDebug: state.lastTurnDebug,
        setupStatus: state.setupStatus,
        profile: getRuntimeProfile(),
        localGpu: getRuntimeLocalGpuSelection(),
        diagnostics: getRuntimeConfigDiagnostics(),
        preflight: getRuntimePreflight(),
        hasEnteredFlow: state.hasEnteredFlow,
        hasSavedSession: hasSavedSession(state)
      }
    );
  }

  function syncView(): void {
    renderLaunchPanel();
    renderSetupWizard();
    renderPlaySurface();
    renderSaveSlots();
    renderSessionSummary();
    renderPreflightPanel();
    renderDebugPanels();
  }

  function setPending(pending: boolean): void {
    state.pending = pending;
    const preflight = getRuntimePreflight();
    const setupBlocked = preflight?.status === "action-required";
    const fatalBlocked = Boolean(state.fatalError || activeFatalUiError);
    const readyForTurns = state.hasEnteredFlow && Boolean(state.player) && !setupBlocked && !fatalBlocked && !pending;

    syncView();

    sendButtonEl.disabled = !readyForTurns;
    inputEl.disabled = !readyForTurns;
    nameEl.disabled = pending || fatalBlocked;
    refreshSessionButtonEl.disabled = pending || fatalBlocked || !state.hasEnteredFlow;
    newSessionButtonEl.disabled = pending || fatalBlocked || !state.hasEnteredFlow;

    Array.from(optionsEl.querySelectorAll("button")).forEach((button) => {
      button.disabled = !readyForTurns;
    });
  }

  setAssist([], []);
  syncView();
  setPending(false);

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sessionController.submitTurn();
  });

  inputEl.addEventListener("input", () => {
    if (state.assistTimer !== null) {
      window.clearTimeout(state.assistTimer);
    }
    state.assistTimer = window.setTimeout(() => {
      sessionController.requestAssist().catch(() => {
        setAssist([], []);
      });
    }, 250);
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formEl.requestSubmit();
    }
  });

  nameEl.addEventListener("change", rememberPlayerName);
  nameEl.addEventListener("blur", rememberPlayerName);

  function handleRecoveryClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const actionId = target.dataset.recoveryAction;
    if (!actionId) {
      return;
    }

    void runRecoveryAction(actionId, {
      setupStatus: state.setupStatus,
      runSetupCheck: () => sessionController.runSetupCheck(),
      copyText,
      setStatus,
      addEntry
    });
  }

  setupActionsEl.addEventListener("click", handleRecoveryClick);
  preflightIssuesEl.addEventListener("click", handleRecoveryClick);

  setupCheckButtonEl.addEventListener("click", async () => {
    await sessionController.runSetupCheck();
  });

  launchNewGameButtonEl.addEventListener("click", () => {
    sessionController.startGameFlow("new").catch((error) => {
      addEntry("System", error instanceof Error ? error.message : "Failed to start a new game.", "system");
      setStatus("Start failed", "error");
      setPending(false);
    });
  });

  launchResumeButtonEl.addEventListener("click", () => {
    sessionController.startGameFlow("resume").catch((error) => {
      addEntry("System", error instanceof Error ? error.message : "Failed to resume the saved game.", "system");
      setStatus("Resume failed", "error");
      setPending(false);
    });
  });

  saveSlotCreateButtonEl.addEventListener("click", () => {
    sessionController.saveCurrentToSlot().catch((error) => {
      addEntry("System", error instanceof Error ? error.message : "Failed to save the current game.", "system");
      setStatus("Save failed", "error");
      setPending(false);
    });
  });

  saveSlotsListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const slotId = target.dataset.saveSlotId;
    const action = target.dataset.saveSlotAction;
    if (!slotId || !action) {
      return;
    }

    if (action === "load") {
      sessionController.loadSaveSlot(slotId).catch((error) => {
        addEntry("System", error instanceof Error ? error.message : "Failed to load the selected save.", "system");
        setStatus("Load failed", "error");
        setPending(false);
      });
      return;
    }

    if (action === "overwrite") {
      sessionController.saveCurrentToSlot(slotId).catch((error) => {
        addEntry("System", error instanceof Error ? error.message : "Failed to overwrite the selected save.", "system");
        setStatus("Save failed", "error");
        setPending(false);
      });
    }
  });

  refreshSessionButtonEl.addEventListener("click", async () => {
    await sessionController.refreshSession();
  });

  newSessionButtonEl.addEventListener("click", async () => {
    if (state.fatalError || activeFatalUiError || !state.hasEnteredFlow) {
      return;
    }

    await sessionController.startGameFlow("new");
  });

  sessionController.bootstrap().catch((error) => {
    sessionController.handleFatalError(createFatalUiErrorState(error), renderAppFatalError);
  });
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  copyTextWithFallback(text);
}

function copyTextWithFallback(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function renderAppFatalError(state: FatalUiErrorState): void {
  activeFatalUiError = state;
  const panel = document.getElementById("fatal-error-panel");
  const titleEl = document.getElementById("fatal-error-title");
  const summaryEl = document.getElementById("fatal-error-summary");
  const detailEl = document.getElementById("fatal-error-detail");
  const recoveryEl = document.getElementById("fatal-error-recovery");
  const statusPillEl = document.getElementById("status-pill");
  const logEl = document.getElementById("log");

  if (panel instanceof HTMLElement) {
    panel.hidden = false;
  }

  if (titleEl instanceof HTMLElement) {
    titleEl.textContent = state.title;
  }

  if (summaryEl instanceof HTMLElement) {
    summaryEl.textContent = state.summary;
  }

  if (detailEl instanceof HTMLElement) {
    detailEl.textContent = state.detail;
  }

  if (recoveryEl instanceof HTMLElement) {
    recoveryEl.textContent = state.recovery;
  }

  if (statusPillEl instanceof HTMLElement) {
    statusPillEl.textContent = state.title;
    statusPillEl.dataset.tone = "error";
  }

  if (logEl instanceof HTMLElement && !logEl.dataset.fatalErrorLogged) {
    const entry = document.createElement("article");
    entry.className = "entry system";

    const title = document.createElement("strong");
    title.textContent = "System";

    const body = document.createElement("div");
    body.textContent = `${state.summary} ${state.recovery}`;

    entry.appendChild(title);
    entry.appendChild(body);
    logEl.appendChild(entry);
    logEl.dataset.fatalErrorLogged = "true";
  }

  disableInteractiveControls();
}

function disableInteractiveControls(): void {
  const ids = [
    "player-name",
    "player-input",
    "send-button",
    "refresh-session",
    "new-session",
    "launch-new-game",
    "launch-resume",
    "save-slot-label",
    "save-slot-create"
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLButtonElement
    ) {
      element.disabled = true;
    }
  });

  Array.from(document.querySelectorAll("#options button")).forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
    }
  });

  Array.from(document.querySelectorAll("#save-slots-list button")).forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
    }
  });
}
