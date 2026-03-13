import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../core/config.js";
import {
  buildDesktopShellPrerequisiteIssuesFromContext,
  readDesktopShellPreflightContext,
  type DesktopShellPreflightContext
} from "./desktop-shell-preflight.js";

function createLiteLlmConfig() {
  return loadConfig({
    AI_PROFILE: "local-gpu-small",
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://127.0.0.1:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });
}

function createContext(overrides: Partial<DesktopShellPreflightContext> = {}): DesktopShellPreflightContext {
  return {
    dockerState: "running",
    gpuState: "ready",
    notes: [],
    ...overrides
  };
}

test("readDesktopShellPreflightContext returns null outside the desktop shell", () => {
  assert.equal(readDesktopShellPreflightContext({}), null);
});

test("readDesktopShellPreflightContext parses desktop shell env values", () => {
  const context = readDesktopShellPreflightContext({
    TEXT_GAME_DESKTOP_SHELL: "1",
    TEXT_GAME_DESKTOP_DOCKER_STATE: "not-running",
    TEXT_GAME_DESKTOP_GPU_STATE: "tooling-missing",
    TEXT_GAME_DESKTOP_PREREQ_NOTES: "Docker CLI returned a daemon error. || nvidia-smi was not found."
  });

  assert.deepEqual(context, {
    dockerState: "not-running",
    gpuState: "tooling-missing",
    notes: ["Docker CLI returned a daemon error.", "nvidia-smi was not found."]
  });
});

test("desktop shell preflight reports missing Docker Desktop separately from LiteLLM startup issues", () => {
  const issues = buildDesktopShellPrerequisiteIssuesFromContext(
    createLiteLlmConfig(),
    createContext({ dockerState: "missing", notes: ["docker.exe was not found on PATH."] })
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "docker_missing");
  assert.match(issues[0]?.recommended_fix || "", /install docker desktop/i);
  assert.match(issues[0]?.details?.notes?.join("\n") || "", /docker\.exe/i);
});

test("desktop shell preflight reports Docker not running as a retryable blocker", () => {
  const issues = buildDesktopShellPrerequisiteIssuesFromContext(
    createLiteLlmConfig(),
    createContext({ dockerState: "not-running", notes: ["The docker daemon is not running."] })
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "docker_not_running");
  assert.match(issues[0]?.message || "", /docker engine is not ready/i);
});

test("desktop shell preflight reports missing GPU tooling only after Docker is available", () => {
  const issues = buildDesktopShellPrerequisiteIssuesFromContext(
    createLiteLlmConfig(),
    createContext({ gpuState: "tooling-missing", notes: ["nvidia-smi was not found."] })
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "gpu_tooling_not_detected");
  assert.match(issues[0]?.recommended_fix || "", /nvidia/i);
});

test("desktop shell preflight stays silent for non-LiteLLM custom provider overrides", () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
    AI_PROVIDER: "openai-compatible",
    AI_API_KEY: "sk-test",
    AI_BASE_URL: "https://api.openai.com/v1",
    AI_CHAT_MODEL: "gpt-4o-mini",
    AI_EMBEDDING_MODEL: "text-embedding-3-small"
  });

  const issues = buildDesktopShellPrerequisiteIssuesFromContext(config, createContext({ dockerState: "missing" }));

  assert.deepEqual(issues, []);
});