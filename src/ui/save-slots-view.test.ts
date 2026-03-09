import assert from "node:assert/strict";
import test from "node:test";
import { createSaveSlotsViewModel } from "./save-slots-view.js";

function createSetupStatus(status: "ready" | "action-required" | "checking") {
  return {
    status,
    summary: status === "ready" ? "Ready." : status === "checking" ? "Checking setup." : "Setup required.",
    checked_at: "2026-03-09T00:00:00.000Z",
    can_retry: true,
    current_profile: {
      id: "local-gpu-small" as const,
      label: "Local GPU Small",
      provider: "litellm",
      chat_model: "game-chat",
      embedding_model: "game-embedding"
    },
    supported_path: {
      provider: "LiteLLM",
      title: "Supported MVP AI path",
      summary: "Use the launcher.",
      launcher: "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1",
      services: ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"]
    },
    preflight: {
      ok: status === "ready",
      status,
      summary: status === "ready" ? "Ready." : status === "checking" ? "Checking setup." : "Setup required.",
      issues: [],
      counts: { blocker: status === "action-required" ? 1 : 0, warning: 0, info: 0 },
      checked_at: "2026-03-09T00:00:00.000Z"
    }
  };
}

test("createSaveSlotsViewModel enables saving when setup is ready and a live game is active", () => {
  const viewModel = createSaveSlotsViewModel({
    slots: [],
    setupStatus: createSetupStatus("ready"),
    pending: false,
    fatalBlocked: false,
    hasEnteredFlow: true,
    hasCurrentPlayer: true
  });

  assert.equal(viewModel.createDisabled, false);
  assert.match(viewModel.summary, /No named saves yet/i);
});

test("createSaveSlotsViewModel disables saving while setup is blocked and summarizes existing slots", () => {
  const viewModel = createSaveSlotsViewModel({
    slots: [
      {
        schema_version: "save-slot/v1",
        id: "slot-1",
        label: "Bridge Checkpoint",
        player_id: "snapshot-1",
        player_name: "Avery",
        location: "Rooftop Market",
        source_schema_version: "authoritative-state/v1",
        saved_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
        status: "ready",
        detail: null
      }
    ],
    setupStatus: createSetupStatus("action-required"),
    pending: false,
    fatalBlocked: false,
    hasEnteredFlow: false,
    hasCurrentPlayer: false
  });

  assert.equal(viewModel.createDisabled, true);
  assert.match(viewModel.summary, /1 named save is available/i);
});
