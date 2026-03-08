import assert from "node:assert/strict";
import test from "node:test";
import { createDebugSnapshot, formatJson } from "./debug-view.js";

function createSetupStatus() {
  return {
    status: "ready" as const,
    summary: "All set.",
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
      services: ["Docker Desktop", "LiteLLM sidecar"]
    },
    preflight: {
      ok: true,
      status: "ready" as const,
      summary: "All set.",
      issues: [],
      counts: { blocker: 0, warning: 0, info: 0 },
      checked_at: "2026-03-08T00:00:00.000Z"
    }
  };
}

test("formatJson returns a fallback payload when value is missing", () => {
  assert.equal(formatJson(null, "Nothing yet."), JSON.stringify({ message: "Nothing yet." }, null, 2));
});

test("createDebugSnapshot prefers current debug values and fatal error state", () => {
  const snapshot = createDebugSnapshot({
    setupStatus: createSetupStatus(),
    sessionDebug: { runtime: { provider: "litellm" }, session: { player_id: "player-123" } },
    lastTurnDebug: { request_id: "req-123", turn: { latency_ms: 42 } },
    player: { id: "player-123", name: "Casey", location: "Bridge" },
    fatalError: null,
    activeFatalUiError: { title: "Unexpected app error", summary: "Stopped.", detail: "boom", recovery: "refresh" }
  });

  assert.equal(snapshot.connectionSnapshot.setup?.status, "ready");
  assert.equal(snapshot.connectionSnapshot.runtime?.provider, "litellm");
  assert.equal(snapshot.connectionSnapshot.last_request_id, "req-123");
  assert.equal(snapshot.player?.location, "Bridge");
  assert.equal(snapshot.turn?.turn?.latency_ms, 42);
  assert.equal(snapshot.connectionSnapshot.fatal_error?.detail, "boom");
});
