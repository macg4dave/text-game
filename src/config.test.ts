import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidConfig,
  buildConfigPreflightIssues,
  ConfigValidationError,
  countPreflightIssues,
  createPreflightReport,
  formatConfigErrors,
  getAiEnvVarNames,
  getPublicRuntimeConfig,
  getSafeConfigDiagnostics,
  hasBlockingPreflightIssue,
  loadConfig
} from "./config.js";

test("loadConfig applies generic defaults and validates when API key is present", () => {
  const loaded = loadConfig({ AI_API_KEY: "sk-test" });

  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.port, 3000);
  assert.equal(loaded.ai.provider, "openai-compatible");
  assert.equal(loaded.ai.chatModel, "gpt-4o-mini");
  assert.equal(loaded.ai.embeddingModel, "text-embedding-3-small");
  assert.equal(loaded.runtime.api_key_configured, true);
});

test("loadConfig defaults to LiteLLM when no provider-specific env is supplied", () => {
  const loaded = loadConfig({});

  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.ai.provider, "litellm");
  assert.equal(loaded.ai.apiKey, "anything");
  assert.equal(loaded.ai.baseUrl, "http://127.0.0.1:4000");
  assert.equal(loaded.ai.chatModel, "game-chat");
  assert.equal(loaded.ai.embeddingModel, "game-embedding");
});

test("loadConfig supports legacy OPENAI_* environment variables", () => {
  const loaded = loadConfig({
    OPENAI_API_KEY: "legacy-key",
    OPENAI_BASE_URL: "https://example.test/v1/",
    OPENAI_MODEL: "legacy-chat",
    OPENAI_EMBEDDING_MODEL: "legacy-embed",
    PORT: "4123"
  });

  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.port, 4123);
  assert.equal(loaded.ai.provider, "openai-compatible");
  assert.equal(loaded.ai.apiKey, "legacy-key");
  assert.equal(loaded.ai.baseUrl, "https://example.test/v1");
  assert.equal(loaded.ai.chatModel, "legacy-chat");
  assert.equal(loaded.ai.embeddingModel, "legacy-embed");
});

test("loadConfig infers Ollama mode from Ollama-specific env vars when AI_PROVIDER is unset", () => {
  const loaded = loadConfig({
    OLLAMA_BASE_URL: "http://host.docker.internal:11434/v1",
    OLLAMA_CHAT_MODEL: "gemma3:4b",
    OLLAMA_EMBEDDING_MODEL: "embeddinggemma"
  });

  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.ai.provider, "ollama");
  assert.equal(loaded.ai.baseUrl, "http://host.docker.internal:11434/v1");
});

test("loadConfig applies LiteLLM defaults without extra env edits", () => {
  const loaded = loadConfig({ AI_PROVIDER: "litellm" });

  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.ai.provider, "litellm");
  assert.equal(loaded.ai.apiKey, "anything");
  assert.equal(loaded.ai.baseUrl, "http://127.0.0.1:4000");
  assert.equal(loaded.ai.chatModel, "game-chat");
  assert.equal(loaded.ai.embeddingModel, "game-embedding");
});

test("loadConfig prefers provider-specific env vars over generic and legacy fallbacks", () => {
  const loaded = loadConfig({
    AI_PROVIDER: "litellm",
    LITELLM_API_KEY: "litellm-key",
    AI_API_KEY: "generic-key",
    OPENAI_API_KEY: "legacy-key",
    LITELLM_PROXY_URL: "http://proxy.test:4000",
    AI_BASE_URL: "https://generic.example/v1",
    OPENAI_BASE_URL: "https://legacy.example/v1",
    LITELLM_CHAT_MODEL: "litellm-chat",
    AI_CHAT_MODEL: "generic-chat",
    OPENAI_MODEL: "legacy-chat",
    LITELLM_EMBEDDING_MODEL: "litellm-embedding",
    AI_EMBEDDING_MODEL: "generic-embedding",
    OPENAI_EMBEDDING_MODEL: "legacy-embedding"
  });

  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.ai.apiKey, "litellm-key");
  assert.equal(loaded.ai.baseUrl, "http://proxy.test:4000");
  assert.equal(loaded.ai.chatModel, "litellm-chat");
  assert.equal(loaded.ai.embeddingModel, "litellm-embedding");
});

test("getAiEnvVarNames returns the provider-aware lookup order", () => {
  assert.deepEqual(getAiEnvVarNames("openai-compatible", "chatModel"), ["AI_CHAT_MODEL", "OPENAI_MODEL"]);
  assert.deepEqual(getAiEnvVarNames("litellm", "baseUrl"), ["LITELLM_PROXY_URL", "AI_BASE_URL", "OPENAI_BASE_URL"]);
  assert.deepEqual(getAiEnvVarNames("ollama", "apiKey"), ["OLLAMA_API_KEY", "AI_API_KEY", "OPENAI_API_KEY"]);
});

test("getSafeConfigDiagnostics reports safe source metadata without leaking secrets", () => {
  const env = {
    AI_PROVIDER: "litellm",
    LITELLM_API_KEY: "super-secret-key",
    AI_CHAT_MODEL: "generic-chat",
    OPENAI_EMBEDDING_MODEL: "legacy-embedding",
    PORT: "3100"
  };
  const loaded = loadConfig(env);
  const diagnostics = getSafeConfigDiagnostics(loaded, env);

  assert.deepEqual(diagnostics.provider, {
    value: "litellm",
    source: "env",
    env_var: "AI_PROVIDER"
  });
  assert.deepEqual(diagnostics.port, {
    value: 3100,
    source: "env",
    env_var: "PORT"
  });
  assert.deepEqual(diagnostics.ai.api_key, {
    configured: true,
    source: "provider-specific",
    env_var: "LITELLM_API_KEY"
  });
  assert.equal("value" in diagnostics.ai.api_key, false);
  assert.deepEqual(diagnostics.ai.chat_model, {
    value: "generic-chat",
    source: "generic",
    env_var: "AI_CHAT_MODEL"
  });
  assert.deepEqual(diagnostics.ai.embedding_model, {
    value: "legacy-embedding",
    source: "legacy",
    env_var: "OPENAI_EMBEDDING_MODEL"
  });
});

test("getSafeConfigDiagnostics marks invalid port env without losing the fallback port", () => {
  const env = {
    AI_API_KEY: "sk-test",
    PORT: "banana"
  };
  const loaded = loadConfig(env);
  const diagnostics = getSafeConfigDiagnostics(loaded, env);

  assert.equal(loaded.port, 3000);
  assert.deepEqual(diagnostics.port, {
    value: 3000,
    source: "invalid-env",
    env_var: "PORT"
  });
  assert.equal(diagnostics.validation.ok, false);
  assert.equal(diagnostics.validation.error_count, 1);
});

test("loadConfig reports an unsupported provider clearly", () => {
  const loaded = loadConfig({ AI_PROVIDER: "mystery-box", AI_API_KEY: "sk-test" });

  assert.equal(loaded.validation.ok, false);
  assert.match(formatConfigErrors(loaded.validation.errors), /AI_PROVIDER must be one of/i);
  assert.throws(() => assertValidConfig(loaded), (error: unknown) => {
    assert.equal(error instanceof ConfigValidationError, true);
    assert.match((error as Error).message, /AI_PROVIDER must be one of/i);
    return true;
  });
});

test("loadConfig requires an API key in openai-compatible mode", () => {
  const loaded = loadConfig({ AI_PROVIDER: "openai-compatible" });

  assert.equal(loaded.validation.ok, false);
  assert.deepEqual(
    loaded.validation.errors.map((error) => error.code),
    ["missing_api_key"]
  );
});

test("loadConfig rejects invalid PORT and base URLs", () => {
  const loaded = loadConfig({
    AI_API_KEY: "sk-test",
    AI_BASE_URL: "not-a-url",
    PORT: "banana"
  });

  assert.equal(loaded.validation.ok, false);
  assert.deepEqual(
    loaded.validation.errors.map((error) => error.code),
    ["invalid_port", "invalid_url"]
  );
});

test("public runtime config omits secrets but keeps actionable validation details", () => {
  const loaded = loadConfig({ AI_PROVIDER: "openai-compatible" });
  const runtime = getPublicRuntimeConfig(loaded);

  assert.equal(runtime.api_key_configured, false);
  assert.equal("apiKey" in runtime, false);
  assert.equal(runtime.validation.ok, false);
  assert.match(runtime.validation.errors[0]?.message ?? "", /AI_API_KEY is required/i);
});

test("buildConfigPreflightIssues turns config failures into player-facing recovery steps", () => {
  const loaded = loadConfig({
    AI_PROVIDER: "openai-compatible",
    AI_BASE_URL: "not-a-url",
    PORT: "banana"
  });

  const issues = buildConfigPreflightIssues(loaded);

  assert.equal(issues.length, 3);
  assert.deepEqual(
    issues.map((issue) => issue.title),
    ["Fix the app port", "Add an API key", "Fix the AI service URL"]
  );
  assert.match(issues[1]?.recovery.join(" "), /AI_API_KEY/i);
  assert.match(issues[2]?.recovery.join(" "), /host\.docker\.internal/i);
  const advisoryEnv = {
    OPENAI_API_KEY: "legacy-key"
  };
  const advisoryLoaded = loadConfig(advisoryEnv);
  const advisoryIssues = buildConfigPreflightIssues(advisoryLoaded, advisoryEnv);
  const advisoryReport = createPreflightReport(advisoryIssues);

  assert.deepEqual(
    advisoryIssues.map((issue) => issue.severity),
    ["info", "warning"]
  );
  assert.equal(advisoryIssues[0]?.code, "provider_inferred");
  assert.equal(advisoryIssues[1]?.code, "legacy_env_vars_in_use");
  assert.equal(advisoryIssues[1]?.recommended_fix, advisoryIssues[1]?.recovery[0] ?? null);
  assert.equal(hasBlockingPreflightIssue(advisoryIssues), false);
  assert.equal(advisoryReport.ok, true);
  assert.equal(advisoryReport.status, "ready");
  assert.deepEqual(countPreflightIssues(advisoryReport.issues), {
    blocker: 0,
    warning: 1,
    info: 1
  });
  assert.match(advisoryReport.summary, /warnings/i);
});
