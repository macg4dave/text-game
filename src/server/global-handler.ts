import process from "node:process";
import type { Logger } from "../core/logging.js";

export type FatalProcessEvent = "uncaughtException" | "unhandledRejection";

export interface ProcessEventTarget {
  on(event: "uncaughtException", listener: (error: Error) => void): ProcessEventTarget;
  on(event: "unhandledRejection", listener: (reason: unknown) => void): ProcessEventTarget;
}

interface GlobalProcessHandlerOptions {
  logger: Logger;
  shutdown: () => Promise<void> | void;
  exit: (code: number) => void;
  scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearScheduledTimeout?: (handle: unknown) => void;
  shutdownTimeoutMs?: number;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

export function createGlobalProcessHandler(options: GlobalProcessHandlerOptions) {
  const scheduleTimeout = options.scheduleTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const clearScheduledTimeout = options.clearScheduledTimeout ?? ((handle) => globalThis.clearTimeout(handle as number));
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let shuttingDown = false;

  async function handleFatalError(event: FatalProcessEvent, reason: unknown): Promise<void> {
    const metadata = {
      event,
      shutdown_timeout_ms: shutdownTimeoutMs,
      fatal_error: reason,
      fatal_error_message: getFatalErrorMessage(reason)
    };

    if (shuttingDown) {
      options.logger.error("fatal process error received during shutdown", metadata);
      return;
    }

    shuttingDown = true;
    options.logger.error("fatal process error received; shutting down", metadata);
    const timeoutHandle = scheduleTimeout(() => {
      options.logger.error("forced process exit after fatal error timeout", {
        event,
        shutdown_timeout_ms: shutdownTimeoutMs
      });
      options.exit(1);
    }, shutdownTimeoutMs);

    try {
      await options.shutdown();
    } catch (shutdownError) {
      options.logger.error("server shutdown failed after fatal error", {
        event,
        shutdown_error: shutdownError,
        shutdown_error_message: getFatalErrorMessage(shutdownError)
      });
    } finally {
      clearScheduledTimeout(timeoutHandle);
      options.exit(1);
    }
  }

  function register(target: ProcessEventTarget = process): void {
    target.on("uncaughtException", (error) => {
      void handleFatalError("uncaughtException", error);
    });
    target.on("unhandledRejection", (reason) => {
      void handleFatalError("unhandledRejection", reason);
    });
  }

  return {
    register,
    handleFatalError
  };
}

function getFatalErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) {
    return reason.message;
  }

  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }

  if (reason && typeof reason === "object" && "message" in reason) {
    const message = reason.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return "Unknown fatal process error";
}
