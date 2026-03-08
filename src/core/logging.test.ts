import assert from "node:assert/strict";
import test from "node:test";
import { createLogger, redactForLogging } from "./logging.js";

test("redactForLogging redacts known secret fields recursively", () => {
  const redacted = redactForLogging({
    authorization: "Bearer super-secret-token",
    apiKey: "sk-secret",
    nested: {
      password: "hunter2",
      token: "abc123",
      safe: "ok"
    }
  }) as Record<string, unknown>;

  assert.equal(redacted.authorization, "[REDACTED]");
  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.deepEqual(redacted.nested, {
    password: "[REDACTED]",
    token: "[REDACTED]",
    safe: "ok"
  });
});

test("createLogger respects the configured log level", () => {
  const entries: string[] = [];
  const logger = createLogger({
    level: "warn",
    sink: (entry) => entries.push(entry)
  });

  logger.debug("debug message");
  logger.info("info message");
  logger.warn("warn message");
  logger.error("error message");

  assert.equal(entries.length, 2);
  assert.match(entries[0] ?? "", /"level":"warn"/);
  assert.match(entries[1] ?? "", /"level":"error"/);
});

test("createLogger includes context and redacts metadata", () => {
  const entries: string[] = [];
  const logger = createLogger({
    level: "debug",
    sink: (entry) => entries.push(entry)
  }).child({ requestId: "req-123", route: "/api/test" });

  logger.info("request finished", {
    authorization: "Bearer super-secret-token",
    durationMs: 42
  });

  assert.equal(entries.length, 1);
  const payload = JSON.parse(entries[0] ?? "{}") as {
    level?: string;
    message?: string;
    requestId?: string;
    route?: string;
    authorization?: string;
    durationMs?: number;
  };

  assert.equal(payload.level, "info");
  assert.equal(payload.message, "request finished");
  assert.equal(payload.requestId, "req-123");
  assert.equal(payload.route, "/api/test");
  assert.equal(payload.authorization, "[REDACTED]");
  assert.equal(payload.durationMs, 42);
});
