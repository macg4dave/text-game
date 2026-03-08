import assert from "node:assert/strict";
import test from "node:test";
import { renderLaunchPanel } from "./launch-view.js";

class FakeElement {
  hidden = false;
  disabled = false;
  textContent = "";
}

function createSetupStatus(status: "ready" | "action-required") {
  return {
    status,
    summary: status === "ready" ? "Ready." : "Setup required.",
    checked_at: "2026-03-08T00:00:00.000Z",
    can_retry: true,
    current_profile: {
      id: "local-gpu-small" as const,
      label: "Local GPU Small",
      provider: "litellm",
      chat_model: "game-chat",
      embedding_model: "game-embedding"
    },
    supported_path: {
      provider: "litellm",
      title: "Supported MVP AI path",
      summary: "Use the launcher.",
      launcher: "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1",
      services: ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"]
    },
    preflight: {
      ok: status === "ready",
      status,
      summary: status === "ready" ? "Ready." : "Setup required.",
      issues: status === "action-required"
        ? [{
            code: "ai_endpoint_unreachable",
            severity: "blocker" as const,
            area: "ai" as const,
            title: "AI service unreachable",
            message: "The AI service is not reachable.",
            recovery: ["Retry the setup check after the launcher finishes starting the stack."],
            recommended_fix: "Retry the setup check after the launcher finishes starting the stack.",
            env_vars: []
          }]
        : [],
      counts: { blocker: status === "action-required" ? 1 : 0, warning: 0, info: 0 },
      checked_at: "2026-03-08T00:00:00.000Z"
    }
  };
}

test("setup browser smoke keeps the saved session id while blocked setup recovers", () => {
  const launchPanelEl = new FakeElement();
  const launchNewGameButtonEl = new FakeElement();
  const launchResumeButtonEl = new FakeElement();
  const launchResumeNoteEl = new FakeElement();
  const savedBrowserSessionId = "player-keep-me";

  renderLaunchPanel(
    {
      launchPanelEl: launchPanelEl as unknown as HTMLElement,
      launchNewGameButtonEl: launchNewGameButtonEl as unknown as HTMLButtonElement,
      launchResumeButtonEl: launchResumeButtonEl as unknown as HTMLButtonElement,
      launchResumeNoteEl: launchResumeNoteEl as unknown as HTMLElement
    },
    {
      hasEnteredFlow: false,
      pending: false,
      fatalBlocked: false,
      hasSavedSession: Boolean(savedBrowserSessionId),
      setupStatus: createSetupStatus("action-required")
    }
  );

  assert.equal(launchPanelEl.hidden, false);
  assert.equal(launchNewGameButtonEl.disabled, true);
  assert.equal(launchResumeButtonEl.disabled, true);
  assert.match(launchResumeNoteEl.textContent, /fix the setup items below/i);

  renderLaunchPanel(
    {
      launchPanelEl: launchPanelEl as unknown as HTMLElement,
      launchNewGameButtonEl: launchNewGameButtonEl as unknown as HTMLButtonElement,
      launchResumeButtonEl: launchResumeButtonEl as unknown as HTMLButtonElement,
      launchResumeNoteEl: launchResumeNoteEl as unknown as HTMLElement
    },
    {
      hasEnteredFlow: false,
      pending: false,
      fatalBlocked: false,
      hasSavedSession: Boolean(savedBrowserSessionId),
      setupStatus: createSetupStatus("ready")
    }
  );

  assert.equal(savedBrowserSessionId, "player-keep-me");
  assert.equal(launchNewGameButtonEl.disabled, false);
  assert.equal(launchResumeButtonEl.disabled, false);
  assert.equal(launchResumeNoteEl.textContent, "Resume uses the last game saved in this browser.");
});