import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig, RuntimePreflightReport } from "../core/types.js";
import { loadConfig } from "../core/config.js";
import { createPreflightReport } from "../core/config/preflight.js";
import { validateSetupStatusResponse } from "../rules/validator.js";
import { createSetupStatusPayload } from "./setup-status.js";

function createConfig(): AppConfig {
  return loadConfig({
    AI_PROFILE: "local-gpu-small",
    AI_PROVIDER: "litellm",
    LITELLM_PROXY_URL: "http://litellm:4000",
    LITELLM_API_KEY: "anything",
    LITELLM_CHAT_MODEL: "game-chat",
    LITELLM_EMBEDDING_MODEL: "game-embedding"
  });
}

test("createSetupStatusPayload returns a validated supported-path setup envelope", () => {
  const config = createConfig();
  const preflight: RuntimePreflightReport = createPreflightReport([]);
  const payload = createSetupStatusPayload(config, preflight);

  assert.equal(payload.setup.status, "ready");
  assert.equal(payload.setup.can_retry, true);
  assert.equal(payload.setup.current_profile.id, "local-gpu-small");
  assert.equal(payload.setup.current_profile.provider, "litellm");
  assert.equal(payload.setup.supported_path.provider, "LiteLLM");
  assert.equal((payload.setup.config_diagnostics as { profile?: { value?: string } } | undefined)?.profile?.value, "local-gpu-small");
  assert.equal(payload.setup.local_gpu, null);
  assert.match(payload.setup.supported_path.summary, /docker/i);
  assert.deepEqual(validateSetupStatusResponse(payload), { ok: true, errors: [] });
});

