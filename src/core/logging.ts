import process from "node:process";
import type { LogLevel } from "./types.js";

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

interface LoggerOptions {
  level: LogLevel;
  sink?: (entry: string, level: LogLevel) => void;
  context?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /(^|_|-)(api[-_]?key|authorization|cookie|password|secret|token|set-cookie)$/i;

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? defaultSink;
  const baseContext = options.context ?? {};

  function log(level: LogLevel, message: string, metadata: Record<string, unknown> = {}): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[options.level]) {
      return;
    }

    const redactedContext = redactForLogging(baseContext) as Record<string, unknown>;
    const redactedMetadata = redactForLogging(metadata) as Record<string, unknown>;
    const payload = {
      time: new Date().toISOString(),
      level,
      message,
      ...redactedContext,
      ...redactedMetadata
    };

    sink(JSON.stringify(payload), level);
  }

  return {
    debug(message, metadata) {
      log("debug", message, metadata);
    },
    info(message, metadata) {
      log("info", message, metadata);
    },
    warn(message, metadata) {
      log("warn", message, metadata);
    },
    error(message, metadata) {
      log("error", message, metadata);
    },
    child(context) {
      return createLogger({
        level: options.level,
        sink,
        context: {
          ...baseContext,
          ...context
        }
      });
    }
  };
}

export function redactForLogging(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[Circular]";
    }

    seen.add(value as object);
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED_VALUE : redactValue(nestedValue, seen);
    }
    seen.delete(value as object);
    return result;
  }

  return value;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function defaultSink(entry: string, level: LogLevel): void {
  if (level === "warn") {
    console.warn(entry);
    return;
  }

  if (level === "error") {
    console.error(entry);
    return;
  }

  process.stdout.write(`${entry}\n`);
}
