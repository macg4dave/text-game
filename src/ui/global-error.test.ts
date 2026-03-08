import assert from "node:assert/strict";
import test from "node:test";
import {
  createFatalUiErrorState,
  registerGlobalErrorHandlers,
  type FatalUiErrorState,
  type GlobalErrorEventTarget
} from "./global-error.js";

test("createFatalUiErrorState keeps plain-language copy and extracts an error message", () => {
  const state = createFatalUiErrorState(new Error("UI exploded"));

  assert.equal(state.title, "Unexpected app error");
  assert.equal(state.summary, "The page hit an unexpected problem and stopped responding safely.");
  assert.equal(state.detail, "UI exploded");
  assert.match(state.recovery, /Refresh the page/i);
});

test("registerGlobalErrorHandlers forwards window error events to the boundary", () => {
  const listeners = createFakeGlobalEventTarget();
  let receivedState: FatalUiErrorState | null = null;

  registerGlobalErrorHandlers(listeners.target, (state) => {
    receivedState = state;
  });

  listeners.dispatchError({
    error: new Error("missing element"),
    message: "missing element"
  });

  const actualState = receivedState as FatalUiErrorState | null;
  assert.ok(actualState);
  assert.equal(actualState.detail, "missing element");
});

test("registerGlobalErrorHandlers forwards unhandled rejections to the boundary", () => {
  const listeners = createFakeGlobalEventTarget();
  let receivedState: FatalUiErrorState | null = null;

  registerGlobalErrorHandlers(listeners.target, (state) => {
    receivedState = state;
  });

  listeners.dispatchUnhandledRejection({
    reason: "network dropped"
  });

  const actualState = receivedState as FatalUiErrorState | null;
  assert.ok(actualState);
  assert.equal(actualState.detail, "network dropped");
});

function createFakeGlobalEventTarget(): {
  target: GlobalErrorEventTarget;
  dispatchError(event: { error?: unknown; message?: string }): void;
  dispatchUnhandledRejection(event: { reason?: unknown }): void;
} {
  let errorListener: ((event: { error?: unknown; message?: string }) => void) | null = null;
  let rejectionListener: ((event: { reason?: unknown }) => void) | null = null;

  return {
    target: {
      addEventListener(type, listener) {
        if (type === "error") {
          errorListener = listener as (event: { error?: unknown; message?: string }) => void;
          return;
        }

        rejectionListener = listener as (event: { reason?: unknown }) => void;
      }
    },
    dispatchError(event) {
      errorListener?.(event);
    },
    dispatchUnhandledRejection(event) {
      rejectionListener?.(event);
    }
  };
}
