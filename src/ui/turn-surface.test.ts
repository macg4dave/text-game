import assert from "node:assert/strict";
import test from "node:test";
import {
  appendLogEntry,
  createAssistViewModel,
  createSessionSummaryViewModel,
  renderAssistChips,
  renderTurnOptions
} from "./turn-surface.js";

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  className = "";
  textContent = "";
  type = "";
  disabled = false;
  scrollTop = 0;
  scrollHeight = 0;
  private _innerHTML = "";
  private listeners = new Map<string, Array<() => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(value: string) {
    this._innerHTML = value;
    if (value === "") {
      this.children = [];
    }
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    this.scrollHeight = this.children.length;
    return child;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click(): void {
    const listeners = this.listeners.get("click") || [];
    listeners.forEach((listener) => listener());
  }
}

function installFakeDocument(): { restore: () => void } {
  const originalDocument = globalThis.document;

  globalThis.document = {
    createElement(tagName: string) {
      return new FakeElement(tagName);
    }
  } as unknown as Document;

  return {
    restore() {
      globalThis.document = originalDocument;
    }
  };
}

test("createAssistViewModel returns a placeholder when assist data is empty", () => {
  const viewModel = createAssistViewModel([], []);

  assert.equal(viewModel.placeholder, "Local assist suggestions appear here.");
  assert.deepEqual(viewModel.sections, []);
});

test("createAssistViewModel groups spelling and completion chips", () => {
  const viewModel = createAssistViewModel(
    [
      { token: "sord", suggestions: ["sword"] },
      { token: "lantrn", suggestions: [] }
    ],
    ["carefully", "north"]
  );

  assert.equal(viewModel.placeholder, null);
  assert.equal(viewModel.sections.length, 2);
  assert.equal(viewModel.sections[0]?.label, "Spelling");
  assert.equal(viewModel.sections[0]?.chips[0]?.text, "sord -> sword");
  assert.equal(viewModel.sections[1]?.label, "Complete");
  assert.deepEqual(
    viewModel.sections[1]?.chips.map((chip) => chip.text),
    ["carefully", "north"]
  );
});

test("createSessionSummaryViewModel preserves ready-to-resume and active-player summary copy", () => {
  const waitingViewModel = createSessionSummaryViewModel({
    player: null,
    sessionDebug: null,
    lastTurnDebug: null,
    setupStatus: null,
    profile: null,
    localGpu: null,
    diagnostics: null,
    preflight: null,
    hasEnteredFlow: false,
    hasSavedSession: true
  });

  assert.equal(waitingViewModel.runtimeText, "Saved game ready to resume");
  assert.match(waitingViewModel.sessionText, /resume the last game saved/i);

  const activeViewModel = createSessionSummaryViewModel({
    player: {
      id: "player-123",
      name: "Casey",
      location: "Bridge",
      director_state: { current_beat_label: "Arrival" }
    },
    sessionDebug: {
      runtime: { provider: "litellm", chat_model: "game-chat" },
      session: { player_id: "player-12345678" }
    },
    lastTurnDebug: null,
    setupStatus: null,
    profile: { label: "Local GPU Small" },
    localGpu: { requested: true, profile_label: "8 GB tier", selection_source: "detected-profile", detected_vram_gb: 8 },
    diagnostics: { profile_overrides: [{ field: "chat_model" }] },
    preflight: {
      ok: false,
      status: "checking",
      summary: "Checking AI",
      issues: [],
      counts: { blocker: 0, warning: 0, info: 0 },
      checked_at: "2026-03-08T00:00:00.000Z"
    },
    hasEnteredFlow: true,
    hasSavedSession: true
  });

  assert.match(activeViewModel.runtimeText, /litellm/i);
  assert.match(activeViewModel.runtimeText, /game-chat/i);
  assert.match(activeViewModel.runtimeText, /player player-1/i);
  assert.match(activeViewModel.profileText, /Local GPU Small/);
  assert.match(activeViewModel.profileText, /1 override/);
  assert.match(activeViewModel.profileText, /8 GB detected/);
  assert.equal(activeViewModel.sessionText, "Casey in Bridge | beat: Arrival");
});

test("appendLogEntry renders the expected log article structure", () => {
  const { restore } = installFakeDocument();

  try {
    const logEl = new FakeElement("section");

    appendLogEntry(logEl as unknown as HTMLElement, {
      label: "Narrator",
      text: "You enter the hall.",
      tone: "narrator"
    });

    assert.equal(logEl.children.length, 1);
    assert.equal(logEl.children[0]?.className, "entry narrator");
    assert.equal(logEl.children[0]?.children[0]?.textContent, "Narrator");
    assert.equal(logEl.children[0]?.children[1]?.textContent, "You enter the hall.");
    assert.equal(logEl.scrollTop, 1);
  } finally {
    restore();
  }
});

test("renderTurnOptions rebuilds option buttons and forwards selections", () => {
  const { restore } = installFakeDocument();

  try {
    const optionsEl = new FakeElement("div");
    let selectedOption = "";

    renderTurnOptions(optionsEl as unknown as HTMLElement, {
      options: ["look around", "open door"],
      disabled: false,
      onSelect(option) {
        selectedOption = option;
      }
    });

    assert.equal(optionsEl.children.length, 2);
    assert.equal(optionsEl.children[0]?.textContent, "look around");
    optionsEl.children[1]?.click();
    assert.equal(selectedOption, "open door");
  } finally {
    restore();
  }
});

test("renderAssistChips renders placeholder and clickable assist chips", () => {
  const { restore } = installFakeDocument();

  try {
    const assistEl = new FakeElement("div");
    const actions: string[] = [];

    renderAssistChips(assistEl as unknown as HTMLElement, {
      corrections: [],
      completions: [],
      onCorrectionSelect(token, suggestion) {
        actions.push(`${token}:${suggestion}`);
      },
      onCompletionSelect(completion) {
        actions.push(completion);
      }
    });

    assert.equal(assistEl.children.length, 1);
    assert.equal(assistEl.children[0]?.className, "assist-placeholder");

    renderAssistChips(assistEl as unknown as HTMLElement, {
      corrections: [{ token: "sord", suggestions: ["sword"] }],
      completions: ["north"],
      onCorrectionSelect(token, suggestion) {
        actions.push(`${token}:${suggestion}`);
      },
      onCompletionSelect(completion) {
        actions.push(completion);
      }
    });

    assert.deepEqual(
      assistEl.children.map((child) => child.textContent),
      ["Spelling", "sord -> sword", "Complete", "north"]
    );
    assistEl.children[1]?.click();
    assistEl.children[3]?.click();
    assert.deepEqual(actions, ["sord:sword", "north"]);
  } finally {
    restore();
  }
});