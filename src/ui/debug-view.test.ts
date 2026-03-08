import assert from "node:assert/strict";
import test from "node:test";
import { createDebugSnapshot, formatJson } from "./debug-view.js";

test("formatJson returns a fallback payload when value is missing", () => {
  assert.equal(formatJson(null, "Nothing yet."), JSON.stringify({ message: "Nothing yet." }, null, 2));
});

test("createDebugSnapshot prefers current debug values and fatal error state", () => {
  const snapshot = createDebugSnapshot({
    setupStatus: { status: "ready", summary: "All set." },
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
