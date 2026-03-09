import assert from "node:assert/strict";
import test from "node:test";
import { createLaunchPanelViewModel } from "./launch-view.js";

function createSetupStatus(status: "ready" | "action-required" | "checking") {
  return {
    status,
    summary: status === "ready" ? "Ready." : status === "checking" ? "Checking setup." : "Setup required.",
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
      launcher: "cargo run --manifest-path launcher/Cargo.toml -- start-dev",
      services: ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"]
    },
    preflight: {
      ok: status === "ready",
      status,
      summary: status === "ready" ? "Ready." : status === "checking" ? "Checking setup." : "Setup required.",
      issues: status === "action-required"
        ? [{
            code: "ai_endpoint_unreachable",
            severity: "blocker" as const,
            area: "ai" as const,
            title: "AI service unreachable",
            message: "The AI service is not reachable.",
            recovery: ["Start the launcher and retry the setup check."],
            recommended_fix: "Start the launcher and retry the setup check.",
            env_vars: []
          }]
        : [],
      counts: { blocker: status === "action-required" ? 1 : 0, warning: 0, info: 0 },
      checked_at: "2026-03-08T00:00:00.000Z"
    }
  };
}

test("createLaunchPanelViewModel keeps launch actions disabled while setup is blocked", () => {
  const viewModel = createLaunchPanelViewModel({
    hasEnteredFlow: false,
    pending: false,
    fatalBlocked: false,
    hasSavedSession: true,
    setupStatus: createSetupStatus("action-required")
  });

  assert.equal(viewModel.hidden, false);
  assert.equal(viewModel.newGameDisabled, true);
  assert.equal(viewModel.resumeDisabled, true);
  assert.match(viewModel.resumeNote, /fix the setup items below/i);
});

test("createLaunchPanelViewModel re-enables resume when setup becomes ready", () => {
  const viewModel = createLaunchPanelViewModel({
    hasEnteredFlow: false,
    pending: false,
    fatalBlocked: false,
    hasSavedSession: true,
    setupStatus: createSetupStatus("ready")
  });

  assert.equal(viewModel.newGameDisabled, false);
  assert.equal(viewModel.resumeDisabled, false);
  assert.equal(viewModel.resumeNote, "Resume uses the last game saved in this browser.");
});

test("createLaunchPanelViewModel keeps the panel hidden after play begins or on fatal error", () => {
  const enteredFlow = createLaunchPanelViewModel({
    hasEnteredFlow: true,
    pending: false,
    fatalBlocked: false,
    hasSavedSession: false,
    setupStatus: createSetupStatus("ready")
  });
  const fatalBlocked = createLaunchPanelViewModel({
    hasEnteredFlow: false,
    pending: false,
    fatalBlocked: true,
    hasSavedSession: false,
    setupStatus: createSetupStatus("ready")
  });

  assert.equal(enteredFlow.hidden, true);
  assert.equal(fatalBlocked.hidden, true);
});
