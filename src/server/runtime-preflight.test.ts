import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../core/config.js";
import { buildLiteLlmHealthIssues, buildTransportIssue } from "./runtime-preflight-ai.js";
import { createJsonProbeTransport } from "./runtime-preflight-probe.js";
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

test("createJsonProbeTransport forwards headers and parses JSON bodies", async () => {
  let capturedAuthHeader = "";
  const transport = createJsonProbeTransport(async (_input, init) => {
    capturedAuthHeader = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
    return createJsonResponse({ ok: true });
  });

  const result = await transport.probeJson("http://litellm:4000/models", {
    headers: {
      Authorization: "Bearer probe-key"
    }
  });

  assert.equal(capturedAuthHeader, "Bearer probe-key");
  assert.ok(!(result instanceof Error));
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, { ok: true });
});

test("buildTransportIssue classifies DNS failures without collapsing them into generic endpoint errors", () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://missing-host:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });

  const issue = buildTransportIssue(config, "http://missing-host:4000/models", new Error("getaddrinfo ENOTFOUND missing-host"));

  assert.equal(issue.code, "ai_dns_lookup_failed");
  assert.equal(issue.severity, "blocker");
  assert.match(issue.recommended_fix || "", /hostname/i);
});

test("buildLiteLlmHealthIssues dedupes repeated upstream failures while keeping affected model notes", () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://litellm:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });

  const issues = buildLiteLlmHealthIssues(
    config,
    {
      unhealthy_endpoints: [
        {
          model: "openai/gpt-4o-mini",
          error: "AuthenticationError: Incorrect API key provided."
        },
        {
          model: "openai/text-embedding-3-small",
          error: "AuthenticationError: Incorrect API key provided."
        }
      ]
    },
    "http://litellm:4000/health"
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "ai_upstream_auth_failed");
  assert.match(issues[0]?.details?.notes?.join("\n") || "", /text-embedding-3-small/);
});

test("runtime preflight reports a LiteLLM proxy auth mismatch separately from endpoint reachability", async () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
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
    assert.ok(report.issues.some((issue) => issue.code === "litellm_proxy_auth_misconfigured"));
  });
});

test("runtime preflight retries transient LiteLLM no_db_connection responses before blocking startup", async () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://litellm:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });

  let modelsCallCount = 0;

  await withMockFetch(async (input) => {
    if (input === "http://litellm:4000/models") {
      modelsCallCount += 1;
      if (modelsCallCount === 1) {
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
      }

      return createJsonResponse({
        object: "list",
        data: [{ id: "game-chat" }, { id: "game-embedding" }]
      });
    }

    if (input === "http://litellm:4000/health") {
      return createJsonResponse({
        healthy_endpoints: [
          {
            model: "openai/gpt-4o-mini",
            api_base: "https://api.openai.com/v1"
          }
        ],
        unhealthy_endpoints: [],
        healthy_count: 1,
        unhealthy_count: 0
      });
    }

    throw new Error(`Unexpected fetch: ${input}`);
  }, async () => {
    const service = createRuntimePreflightService(config, 0);
    const report = await service.ensureReport({ force: true });

    assert.equal(modelsCallCount, 2);
    assert.equal(report.ok, true);
    assert.ok(!report.issues.some((issue) => issue.severity === "blocker"));
  });
});

test("runtime preflight blocks when LiteLLM aliases exist but upstream credentials are rejected", async () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
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
    AI_PROFILE: "custom",
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

test("runtime preflight ignores LiteLLM health false positives for embedding-only Ollama models", async () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
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
        healthy_endpoints: [
          {
            model: "ollama/gemma3:4b",
            api_base: "http://host.docker.internal:11434"
          }
        ],
        unhealthy_endpoints: [
          {
            model: "ollama/embeddinggemma",
            api_base: "http://host.docker.internal:11434",
            error: 'litellm.APIConnectionError: OllamaException - {"error":"\\"embeddinggemma\\" does not support generate"}'
          }
        ],
        healthy_count: 1,
        unhealthy_count: 1
      });
    }

    throw new Error(`Unexpected fetch: ${input}`);
  }, async () => {
    const service = createRuntimePreflightService(config, 0);
    const report = await service.ensureReport({ force: true });

    assert.equal(report.ok, true);
    assert.ok(!report.issues.some((issue) => issue.severity === "blocker"));
  });
});

test("runtime preflight ignores LiteLLM health probe timeouts after models load successfully", async () => {
  const config = loadConfig({
    AI_PROFILE: "custom",
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
      throw new Error("The operation was aborted due to timeout");
    }

    throw new Error(`Unexpected fetch: ${input}`);
  }, async () => {
    const service = createRuntimePreflightService(config, 0);
    const report = await service.ensureReport({ force: true });

    assert.equal(report.ok, true);
    assert.ok(!report.issues.some((issue) => issue.severity === "blocker"));
  });
});
