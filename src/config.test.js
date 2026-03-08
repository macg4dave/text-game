import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidConfig,
  ConfigValidationError,
  formatConfigErrors,
  getPublicRuntimeConfig,
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
  assert.equal(loaded.ai.apiKey, "legacy-key");
  assert.equal(loaded.ai.baseUrl, "https://example.test/v1");
  assert.equal(loaded.ai.chatModel, "legacy-chat");
  assert.equal(loaded.ai.embeddingModel, "legacy-embed");
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

test("loadConfig reports an unsupported provider clearly", () => {
  const loaded = loadConfig({ AI_PROVIDER: "mystery-box", AI_API_KEY: "sk-test" });

  assert.equal(loaded.validation.ok, false);
  assert.match(formatConfigErrors(loaded.validation.errors), /AI_PROVIDER must be one of/i);
  assert.throws(() => assertValidConfig(loaded), (error) => {
    assert.equal(error instanceof ConfigValidationError, true);
    assert.match(error.message, /AI_PROVIDER must be one of/i);
    return true;
  });
});

test("loadConfig requires an API key in openai-compatible mode", () => {
  const loaded = loadConfig({});

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
  assert.match(runtime.validation.errors[0].message, /AI_API_KEY is required/i);
});
