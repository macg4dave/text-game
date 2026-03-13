import assert from "node:assert/strict";
import test from "node:test";
import {
  createTutorialViewModel,
  dismissTutorial,
  incrementTutorialTurns,
  readTutorialProgress,
  renderTutorialPanel,
  writeTutorialProgress
} from "./tutorial-view.js";

class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();

  constructor(entries: Array<[string, string]> = []) {
    entries.forEach(([key, value]) => this.map.set(key, value));
  }

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  textContent = "";
  hidden = false;
  private html = "";

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML(): string {
    return this.html;
  }

  set innerHTML(value: string) {
    this.html = value;
    if (value === "") {
      this.children = [];
    }
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
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

test("tutorial progress storage reads, writes, increments, and dismisses cleanly", () => {
  const storage = new FakeStorage();

  assert.deepEqual(readTutorialProgress(storage), { completedTurns: 0, dismissed: false });

  writeTutorialProgress(storage, { completedTurns: 1, dismissed: false });
  assert.deepEqual(readTutorialProgress(storage), { completedTurns: 1, dismissed: false });

  const afterSecondTurn = incrementTutorialTurns(storage, readTutorialProgress(storage));
  assert.deepEqual(afterSecondTurn, { completedTurns: 2, dismissed: false });

  const afterThirdTurn = incrementTutorialTurns(storage, afterSecondTurn);
  assert.deepEqual(afterThirdTurn, { completedTurns: 3, dismissed: true });

  const dismissed = dismissTutorial(storage, { completedTurns: 0, dismissed: false });
  assert.deepEqual(dismissed, { completedTurns: 0, dismissed: true });
});

test("createTutorialViewModel stays hidden before play begins or after the guide is complete", () => {
  const beforeStart = createTutorialViewModel({
    hasEnteredFlow: false,
    hasPlayer: false,
    setupBlocked: false,
    hasSavedSession: false,
    progress: { completedTurns: 0, dismissed: false }
  });
  const afterCompletion = createTutorialViewModel({
    hasEnteredFlow: true,
    hasPlayer: true,
    setupBlocked: false,
    hasSavedSession: true,
    progress: { completedTurns: 3, dismissed: true }
  });

  assert.equal(beforeStart.hidden, true);
  assert.equal(afterCompletion.hidden, true);
});

test("createTutorialViewModel gives concise first-session guidance for the first three turns", () => {
  const firstTurn = createTutorialViewModel({
    hasEnteredFlow: true,
    hasPlayer: true,
    setupBlocked: false,
    hasSavedSession: false,
    progress: { completedTurns: 0, dismissed: false }
  });
  const secondTurn = createTutorialViewModel({
    hasEnteredFlow: true,
    hasPlayer: true,
    setupBlocked: false,
    hasSavedSession: true,
    progress: { completedTurns: 1, dismissed: false }
  });
  const thirdTurn = createTutorialViewModel({
    hasEnteredFlow: true,
    hasPlayer: true,
    setupBlocked: false,
    hasSavedSession: true,
    progress: { completedTurns: 2, dismissed: false }
  });

  assert.equal(firstTurn.title, "First three turns");
  assert.equal(firstTurn.tips.length, 3);
  assert.match(firstTurn.tips[0]?.description || "", /look around/i);
  assert.match(firstTurn.footer, /retry and repair actions/i);

  assert.match(secondTurn.title, /vary your moves/i);
  assert.match(secondTurn.tips[2]?.description || "", /refresh/i);

  assert.match(thirdTurn.title, /last quick pointer/i);
  assert.match(thirdTurn.tips[0]?.description || "", /named save/i);
  assert.match(thirdTurn.footer, /next successful turn/i);
});

test("renderTutorialPanel builds the visible checklist and clears itself when hidden", () => {
  const { restore } = installFakeDocument();

  try {
    const panelEl = new FakeElement("section");
    const titleEl = new FakeElement("h3");
    const summaryEl = new FakeElement("p");
    const listEl = new FakeElement("ol");
    const footerEl = new FakeElement("p");
    const dismissButtonEl = new FakeElement("button");

    renderTutorialPanel(
      {
        panelEl: panelEl as unknown as HTMLElement,
        titleEl: titleEl as unknown as HTMLElement,
        summaryEl: summaryEl as unknown as HTMLElement,
        listEl: listEl as unknown as HTMLElement,
        footerEl: footerEl as unknown as HTMLElement,
        dismissButtonEl: dismissButtonEl as unknown as HTMLButtonElement
      },
      {
        hasEnteredFlow: true,
        hasPlayer: true,
        setupBlocked: false,
        hasSavedSession: false,
        progress: { completedTurns: 0, dismissed: false }
      }
    );

    assert.equal(panelEl.hidden, false);
    assert.equal(titleEl.textContent, "First three turns");
    assert.equal(listEl.children.length, 3);
    assert.equal(listEl.children[0]?.children[0]?.textContent, "Get your bearings");

    renderTutorialPanel(
      {
        panelEl: panelEl as unknown as HTMLElement,
        titleEl: titleEl as unknown as HTMLElement,
        summaryEl: summaryEl as unknown as HTMLElement,
        listEl: listEl as unknown as HTMLElement,
        footerEl: footerEl as unknown as HTMLElement,
        dismissButtonEl: dismissButtonEl as unknown as HTMLButtonElement
      },
      {
        hasEnteredFlow: true,
        hasPlayer: true,
        setupBlocked: false,
        hasSavedSession: true,
        progress: { completedTurns: 3, dismissed: true }
      }
    );

    assert.equal(panelEl.hidden, true);
    assert.equal(listEl.children.length, 0);
    assert.equal(titleEl.textContent, "");
  } finally {
    restore();
  }
});
