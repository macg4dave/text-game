import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson, formatErrorMessage } from "./http-client.js";

test("formatErrorMessage prefers joined detail arrays", () => {
  const message = formatErrorMessage({ detail: ["missing docker", "retry setup"] }, "fallback");

  assert.equal(message, "missing docker, retry setup");
});

test("fetchJson parses JSON payloads and exposes request id", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "x-request-id": "req-123" }
    });

  try {
    const result = await fetchJson<{ ok: boolean }>("/api/test");

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { ok: true });
    assert.equal(result.requestId, "req-123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchJson falls back to a text error payload when JSON parsing fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response("service unavailable", {
      status: 503
    });

  try {
    const result = await fetchJson<{ error: string }>("/api/test");

    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.deepEqual(result.data, { error: "service unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});