import type { SaveSlotSummary, SetupStatus } from "./contracts.js";

export interface SaveSlotsViewElements {
  panelEl: HTMLElement;
  summaryEl: HTMLElement;
  errorEl: HTMLElement;
  listEl: HTMLElement;
  labelInputEl: HTMLInputElement;
  createButtonEl: HTMLButtonElement;
}

export interface SaveSlotsViewModel {
  createDisabled: boolean;
  summary: string;
  emptyMessage: string;
}

export function createSaveSlotsViewModel(params: {
  slots: SaveSlotSummary[];
  setupStatus: SetupStatus | null;
  pending: boolean;
  fatalBlocked: boolean;
  hasEnteredFlow: boolean;
  hasCurrentPlayer: boolean;
}): SaveSlotsViewModel {
  const setupReady = params.setupStatus?.status === "ready";
  const createDisabled = !setupReady || params.pending || params.fatalBlocked || !params.hasEnteredFlow || !params.hasCurrentPlayer;

  if (!params.slots.length) {
    return {
      createDisabled,
      summary: createDisabled
        ? "No named saves yet. Start or load a game to create a reusable checkpoint."
        : "No named saves yet. Give the current game a plain-language name and save it when you want a checkpoint.",
      emptyMessage: "No named save slots yet."
    };
  }

  return {
    createDisabled,
    summary:
      params.slots.length === 1
        ? "1 named save is available. Load it any time or overwrite it from the current game."
        : `${params.slots.length} named saves are available. Load any ready slot or overwrite one from the current game.`,
    emptyMessage: ""
  };
}

export function renderSaveSlotsPanel(
  elements: SaveSlotsViewElements,
  params: {
    slots: SaveSlotSummary[];
    saveSlotsError: string | null;
    setupStatus: SetupStatus | null;
    pending: boolean;
    fatalBlocked: boolean;
    hasEnteredFlow: boolean;
    hasCurrentPlayer: boolean;
    currentSaveSlotId: string | null;
  }
): void {
  const viewModel = createSaveSlotsViewModel({
    slots: params.slots,
    setupStatus: params.setupStatus,
    pending: params.pending,
    fatalBlocked: params.fatalBlocked,
    hasEnteredFlow: params.hasEnteredFlow,
    hasCurrentPlayer: params.hasCurrentPlayer
  });
  const setupReady = params.setupStatus?.status === "ready";

  elements.panelEl.hidden = false;
  elements.summaryEl.textContent = viewModel.summary;
  elements.createButtonEl.disabled = viewModel.createDisabled;
  elements.labelInputEl.disabled = viewModel.createDisabled;

  if (params.saveSlotsError) {
    elements.errorEl.hidden = false;
    elements.errorEl.textContent = params.saveSlotsError;
  } else {
    elements.errorEl.hidden = true;
    elements.errorEl.textContent = "";
  }

  elements.listEl.replaceChildren();

  if (!params.slots.length) {
    const empty = document.createElement("p");
    empty.className = "save-slot-empty";
    empty.textContent = viewModel.emptyMessage;
    elements.listEl.appendChild(empty);
    return;
  }

  params.slots.forEach((slot) => {
    const card = document.createElement("article");
    card.className = "save-slot-card";

    const heading = document.createElement("div");
    heading.className = "save-slot-card-header";

    const title = document.createElement("strong");
    title.textContent = slot.label;

    const status = document.createElement("span");
    status.className = "save-slot-status";
    status.dataset.status = slot.status;
    status.textContent = formatSlotStatus(slot.status);

    heading.append(title, status);

    const meta = document.createElement("p");
    meta.className = "save-slot-meta";
    meta.textContent = buildSlotMeta(slot);

    card.append(heading, meta);

    if (slot.detail) {
      const detail = document.createElement("p");
      detail.className = "save-slot-detail";
      detail.textContent = slot.detail;
      card.appendChild(detail);
    }

    if (params.currentSaveSlotId === slot.id) {
      const current = document.createElement("p");
      current.className = "save-slot-current";
      current.textContent = "Current checkpoint source";
      card.appendChild(current);
    }

    const actions = document.createElement("div");
    actions.className = "save-slot-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "secondary";
    loadButton.textContent = "Load Slot";
    loadButton.dataset.saveSlotAction = "load";
    loadButton.dataset.saveSlotId = slot.id;
    loadButton.disabled = params.pending || params.fatalBlocked || !setupReady || slot.status !== "ready";

    const overwriteButton = document.createElement("button");
    overwriteButton.type = "button";
    overwriteButton.className = "secondary";
    overwriteButton.textContent = "Overwrite";
    overwriteButton.dataset.saveSlotAction = "overwrite";
    overwriteButton.dataset.saveSlotId = slot.id;
    overwriteButton.disabled = viewModel.createDisabled || slot.status !== "ready";

    actions.append(loadButton, overwriteButton);
    card.appendChild(actions);
    elements.listEl.appendChild(card);
  });
}

function buildSlotMeta(slot: SaveSlotSummary): string {
  const owner = slot.player_name || "Unknown player";
  const location = slot.location || "Unknown location";
  return `${owner} - ${location} - Saved ${formatTimestamp(slot.updated_at)}`;
}

function formatSlotStatus(status: SaveSlotSummary["status"]): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "corrupted":
      return "Needs repair";
    case "incompatible":
      return "Incompatible";
    default:
      return status;
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
