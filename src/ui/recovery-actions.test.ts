import assert from "node:assert/strict";
import test from "node:test";
import { runRecoveryAction } from "./recovery-actions.js";

function createSetupStatus() {
  return {
    status: "action-required" as const,
    summary: "Setup required.",
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
      provider: "LiteLLM",
      title: "Supported MVP AI path",
      summary: "Use the launcher.",
      launcher: "cargo run --manifest-path launcher/Cargo.toml -- start-dev",
      services: ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"]
    },
    preflight: {
      ok: false,
      status: "action-required" as const,
      summary: "Setup required.",
      issues: [],
      counts: {
        blocker: 1,
        warning: 0,
        info: 0
      },
      checked_at: "2026-03-08T00:00:00.000Z"
    }
  };
}

test("runRecoveryAction copies the supported launcher command", async () => {
  let copiedText = "";
  const statuses: string[] = [];
  const entries: string[] = [];

  await runRecoveryAction("copy-launcher-command", {
    setupStatus: createSetupStatus(),
    async runSetupCheck() {},
    async copyText(text) {
      copiedText = text;
    },
    setStatus(text) {
      statuses.push(text);
    },
    addEntry(_label, text) {
      entries.push(text);
    }
  });

  assert.equal(copiedText, "cargo run --manifest-path launcher/Cargo.toml -- start-dev");
  assert.deepEqual(statuses, ["Launcher command copied"]);
  assert.deepEqual(entries, ["Launcher command copied"]);
});

test("runRecoveryAction copies the GPU repair checklist with the launcher path", async () => {
  let copiedText = "";

  await runRecoveryAction("copy-gpu-repair-checklist", {
    setupStatus: createSetupStatus(),
    async runSetupCheck() {},
    async copyText(text) {
      copiedText = text;
    },
    setStatus() {},
    addEntry() {}
  });

  assert.match(copiedText, /GPU-backed repair checklist/i);
  assert.match(copiedText, /cargo run --manifest-path launcher\/Cargo\.toml -- start-dev|cargo run --manifest-path launcher\\Cargo\.toml -- start-dev/i);
  assert.match(copiedText, /Retry the setup check without clearing the saved browser session/i);
});
