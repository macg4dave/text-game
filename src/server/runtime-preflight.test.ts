import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../core/config.js";
import { createRuntimePreflightService } from "./runtime-preflight.js";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

async function withMockFetch(
  responder: (input: string, init?: RequestInit) => Promise<Response> | Response,
  run: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    responder(String(input), init)) as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("runtime preflight reports a LiteLLM proxy auth mismatch separately from endpoint reachability", async () => {
  const config = loadConfig({
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://litellm:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });

  await withMockFetch(async (input) => {
    assert.equal(input, "http://litellm:4000/models");
    return createJsonResponse(
      {
        error: {
          message: "No connected db.",
          type: "no_db_connection",
          code: "400"
        }
      },
      400
    );
  }, async () => {
    const service = createRuntimePreflightService(config, 0);
    const report = await service.ensureReport({ force: true });

    assert.equal(report.ok, false);
    assert.equal(report.issues[0]?.code, "litellm_proxy_auth_misconfigured");
  });
});

test("runtime preflight blocks when LiteLLM aliases exist but upstream credentials are rejected", async () => {
  const config = loadConfig({
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://litellm:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });

  await withMockFetch(async (input) => {
    if (input === "http://litellm:4000/models") {
      return createJsonResponse({
        object: "list",
        data: [{ id: "game-chat" }, { id: "game-embedding" }]
      });
    }

    if (input === "http://litellm:4000/health") {
      return createJsonResponse({
        healthy_endpoints: [],
        unhealthy_endpoints: [
          {
            model: "openai/gpt-4o-mini",
            error:
              "litellm.AuthenticationError: AuthenticationError: OpenAIException - Incorrect API key provided: sk-placeholder."
          }
        ],
        healthy_count: 0,
        unhealthy_count: 1
      });
    }

    throw new Error(`Unexpected fetch: ${input}`);
  }, async () => {
    const service = createRuntimePreflightService(config, 0);
    const report = await service.ensureReport({ force: true });

    assert.equal(report.ok, false);
    assert.ok(report.issues.some((issue) => issue.code === "ai_upstream_auth_failed"));
  });
});

test("runtime preflight reports missing local models behind LiteLLM health checks", async () => {
  const config = loadConfig({
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://litellm:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });

  await withMockFetch(async (input) => {
    if (input === "http://litellm:4000/models") {
      return createJsonResponse({
        object: "list",
        data: [{ id: "game-chat" }, { id: "game-embedding" }]
      });
    }

    if (input === "http://litellm:4000/health") {
      return createJsonResponse({
        healthy_endpoints: [],
        unhealthy_endpoints: [
          {
            model: "ollama/gemma3:4b",
            error: "model 'gemma3:4b' not found, try pulling it first"
          }
        ],
        healthy_count: 0,
        unhealthy_count: 1
      });
    }

    throw new Error(`Unexpected fetch: ${input}`);
  }, async () => {
    const service = createRuntimePreflightService(config, 0);
    const report = await service.ensureReport({ force: true });

    assert.equal(report.ok, false);
    assert.ok(report.issues.some((issue) => issue.code === "local_model_missing"));
  });
});
