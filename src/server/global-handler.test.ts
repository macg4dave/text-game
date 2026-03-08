import assert from "node:assert/strict";
import test from "node:test";
import { createLogger } from "../core/logging.js";
import { createGlobalProcessHandler } from "./global-handler.js";

test("global process handler logs fatal errors, shuts down once, and exits", async () => {
  const entries: string[] = [];
  const shutdownCalls: string[] = [];
  const exitCodes: number[] = [];
  const logger = createLogger({
    level: "debug",
    sink: (entry) => entries.push(entry)
  });
  const handler = createGlobalProcessHandler({
    logger,
    shutdown: async () => {
      shutdownCalls.push("shutdown");
    },
    exit: (code) => {
      exitCodes.push(code);
    },
    scheduleTimeout: () => ({ id: "timeout" }),
    clearScheduledTimeout: () => {}
  });

  await handler.handleFatalError("unhandledRejection", new Error("fatal boom"));

  assert.deepEqual(shutdownCalls, ["shutdown"]);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(entries.some((entry) => entry.includes("\"message\":\"fatal process error received; shutting down\"")));
  assert.ok(entries.some((entry) => entry.includes("\"event\":\"unhandledRejection\"")));
  assert.ok(entries.some((entry) => entry.includes("\"fatal_error_message\":\"fatal boom\"")));
});

test("global process handler ignores duplicate fatal events while shutdown is already running", async () => {
  const entries: string[] = [];
  const exitCodes: number[] = [];
  let shutdownCalls = 0;
  let resolveShutdown: () => void = () => {};
  const shutdown = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });
  const logger = createLogger({
    level: "debug",
    sink: (entry) => entries.push(entry)
  });
  const handler = createGlobalProcessHandler({
    logger,
    shutdown: async () => {
      shutdownCalls += 1;
      await shutdown;
    },
    exit: (code) => {
      exitCodes.push(code);
    },
    scheduleTimeout: () => ({ id: "timeout" }),
    clearScheduledTimeout: () => {}
  });

  const first = handler.handleFatalError("uncaughtException", new Error("first boom"));
  await Promise.resolve();
  await handler.handleFatalError("unhandledRejection", "second boom");
  resolveShutdown();
  await first;

  assert.equal(shutdownCalls, 1);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(entries.some((entry) => entry.includes("\"message\":\"fatal process error received during shutdown\"")));
});

test("global process handler registers both process-level listeners", () => {
  const listeners: Partial<Record<"uncaughtException" | "unhandledRejection", Function>> = {};
  const logger = createLogger({
    level: "debug",
    sink: () => {}
  });
  const handler = createGlobalProcessHandler({
    logger,
    shutdown: () => {},
    exit: () => {},
    scheduleTimeout: () => ({ id: "timeout" }),
    clearScheduledTimeout: () => {}
  });

  handler.register({
    on(event, listener) {
      listeners[event] = listener as Function;
      return this;
    }
  });

  assert.equal(typeof listeners.uncaughtException, "function");
  assert.equal(typeof listeners.unhandledRejection, "function");
});
