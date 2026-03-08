import {
  buildConfigPreflightIssues,
  createPreflightReport,
  getAiEnvVarNames,
  hasBlockingPreflightIssue
} from "../core/config.js";
import type {
  AppConfig,
  RuntimePreflightIssue,
  RuntimePreflightIssueDetails,
  RuntimePreflightReport
} from "../core/types.js";
import { probeHostPrerequisiteIssues } from "./host-preflight.js";

const DEFAULT_PREFLIGHT_CACHE_MS = 15000;

export interface RuntimePreflightService {
  getCurrentReport(): RuntimePreflightReport;
  ensureReport(options?: { force?: boolean }): Promise<RuntimePreflightReport>;
}

export function createRuntimePreflightService(
  config: AppConfig,
  cacheMs = DEFAULT_PREFLIGHT_CACHE_MS
): RuntimePreflightService {
  let runtimePreflight = createInitialRuntimePreflight(config);
  let runtimePreflightCheckStartedAt = 0;
  let runtimePreflightPromise: Promise<RuntimePreflightReport> | null = null;

  return {
    getCurrentReport() {
      return runtimePreflight;
    },
    ensureReport
  };

  async function ensureReport({ force = false }: { force?: boolean } = {}): Promise<RuntimePreflightReport> {
    if (
      !force &&
      runtimePreflight.checked_at &&
      Date.now() - runtimePreflightCheckStartedAt < cacheMs
    ) {
      return runtimePreflight;
    }

    if (runtimePreflightPromise) {
      return runtimePreflightPromise;
    }

    runtimePreflightPromise = refreshRuntimePreflight();
    try {
      return await runtimePreflightPromise;
    } finally {
      runtimePreflightPromise = null;
    }
  }

  async function refreshRuntimePreflight(): Promise<RuntimePreflightReport> {
    runtimePreflightCheckStartedAt = Date.now();

    const configIssues = buildConfigPreflightIssues(config);
    if (hasBlockingPreflightIssue(configIssues)) {
      runtimePreflight = createPreflightReport(configIssues);
      return runtimePreflight;
    }

    const hostIssues = await probeHostPrerequisiteIssues();
    if (hasBlockingPreflightIssue(hostIssues)) {
      runtimePreflight = createPreflightReport([...configIssues, ...hostIssues]);
      return runtimePreflight;
    }

    const aiIssues = await probeAiRuntimeIssues();
    runtimePreflight = createPreflightReport([...configIssues, ...hostIssues, ...aiIssues]);
    return runtimePreflight;
  }

  async function probeAiRuntimeIssues(): Promise<RuntimePreflightIssue[]> {
    const modelsUrl = getModelsUrl();
    if (!modelsUrl) {
      return [];
    }

    let response: globalThis.Response;

    try {
      response = await fetch(modelsUrl, {
        headers: buildModelsRequestHeaders(),
        signal: AbortSignal.timeout(5000)
      });
    } catch (error) {
      return [buildEndpointIssue("The app could not reach the configured AI service URL.", modelsUrl, null, error)];
    }

    if (response.status === 401 || response.status === 403) {
      return [buildAuthIssue(modelsUrl, response.status)];
    }

    if (response.status === 404) {
      return [buildEndpointIssue("The configured AI service URL did not expose a models list.", modelsUrl, response.status)];
    }

    if (!response.ok) {
      return [
        buildEndpointIssue(
          `The AI service responded with HTTP ${response.status} during startup.`,
          modelsUrl,
          response.status
        )
      ];
    }

    const modelIds = await readModelIds(response);
    if (!modelIds.length) {
      return [];
    }

    const issues: RuntimePreflightIssue[] = [];
    if (!modelIds.includes(config.ai.chatModel)) {
      issues.push(buildModelAliasIssue("chat", config.ai.chatModel, modelIds, modelsUrl));
    }
    if (!modelIds.includes(config.ai.embeddingModel)) {
      issues.push(buildModelAliasIssue("embedding", config.ai.embeddingModel, modelIds, modelsUrl));
    }

    return issues;
  }

  function buildModelsRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    if (config.ai.apiKey) {
      headers.Authorization = `Bearer ${config.ai.apiKey}`;
    }

    return headers;
  }

  function getModelsUrl(): string | null {
    const baseUrl =
      config.ai.baseUrl || (config.ai.provider === "openai-compatible" ? "https://api.openai.com/v1" : "");
    if (!baseUrl) {
      return null;
    }

    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL("models", normalizedBaseUrl).toString();
  }

  function buildEndpointIssue(
    message: string,
    probeTarget: string,
    statusCode: number | null,
    error?: unknown
  ): RuntimePreflightIssue {
    return {
      code: "ai_endpoint_unreachable",
      severity: "blocker",
      area: "ai",
      title: "Start or fix the AI service",
      message,
      recovery: [
        `Check the configured base URL: ${config.ai.baseUrl || "https://api.openai.com/v1"}.`,
        config.ai.provider === "ollama"
          ? "Start Ollama and confirm OLLAMA_BASE_URL points at the running API."
          : config.ai.provider === "litellm"
            ? "Start LiteLLM and confirm LITELLM_PROXY_URL matches the running proxy."
            : "Confirm the provider URL is reachable and accepts OpenAI-compatible requests.",
        "If the app runs in Docker and the AI service runs on your PC, use host.docker.internal instead of localhost."
      ],
      recommended_fix:
        config.ai.provider === "ollama"
          ? "Start Ollama and confirm OLLAMA_BASE_URL points at the running API."
          : config.ai.provider === "litellm"
            ? "Start LiteLLM and confirm LITELLM_PROXY_URL matches the running proxy."
            : "Confirm the provider URL is reachable and accepts OpenAI-compatible requests.",
      env_vars: getAiEnvVarNames(config.ai.provider, "baseUrl"),
      details: buildIssueDetails({
        check: "ai-models-probe",
        provider: config.ai.provider,
        probe_target: probeTarget,
        http_status: statusCode,
        notes: error ? [getErrorMessage(error)] : []
      })
    };
  }

  function buildAuthIssue(probeTarget: string, statusCode: number): RuntimePreflightIssue {
    return {
      code: "ai_auth_rejected",
      severity: "blocker",
      area: "ai",
      title: "Fix the AI credentials",
      message: "The AI service rejected the configured credentials during startup.",
      recovery: [
        config.ai.provider === "litellm"
          ? "Check LITELLM_API_KEY or the upstream credentials configured behind LiteLLM."
          : "Check the API key in .env and confirm it still has access to the selected models.",
        "Restart the launcher after saving the updated credentials."
      ],
      recommended_fix:
        config.ai.provider === "litellm"
          ? "Check LITELLM_API_KEY or the upstream credentials configured behind LiteLLM."
          : "Check the API key in .env and confirm it still has access to the selected models.",
      env_vars: getAiEnvVarNames(config.ai.provider, "apiKey"),
      details: buildIssueDetails({
        check: "ai-models-probe",
        provider: config.ai.provider,
        probe_target: probeTarget,
        http_status: statusCode
      })
    };
  }

  function buildModelAliasIssue(
    kind: "chat" | "embedding",
    configuredModel: string,
    availableModels: string[],
    probeTarget: string
  ): RuntimePreflightIssue {
    const availablePreview = availableModels.slice(0, 5).join(", ");
    const envVars = getAiEnvVarNames(config.ai.provider, kind === "chat" ? "chatModel" : "embeddingModel");

    const providerSpecificStep =
      config.ai.provider === "litellm"
        ? "Check the alias names in litellm.config.yaml and make sure this alias is exposed by the proxy."
        : config.ai.provider === "ollama"
          ? "Install the model in Ollama or update the configured model name to one returned by the local API."
          : "Update the configured model name to one returned by the provider's /models endpoint.";

    return {
      code: `${kind}_model_alias_missing`,
      severity: "blocker",
      area: "ai",
      title: `${kind === "chat" ? "Chat" : "Embedding"} model not found`,
      message: `The configured ${kind} model "${configuredModel}" was not listed by the AI service.`,
      recovery: [
        providerSpecificStep,
        availablePreview
          ? `Available models reported at startup: ${availablePreview}.`
          : "No model names were returned to compare against."
      ],
      recommended_fix: providerSpecificStep,
      env_vars: envVars,
      details: buildIssueDetails({
        check: "ai-models-probe",
        provider: config.ai.provider,
        probe_target: probeTarget,
        available_models_preview: availableModels.slice(0, 5),
        notes: [`Configured ${kind} model: ${configuredModel}`]
      })
    };
  }
}

function createInitialRuntimePreflight(config: AppConfig): RuntimePreflightReport {
  const issues = buildConfigPreflightIssues(config);
  if (hasBlockingPreflightIssue(issues)) {
    return createPreflightReport(issues);
  }

  if (issues.length) {
    return createPreflightReport(issues, {
      status: "checking",
      summary: "Checking the remaining host and AI startup requirements before the first turn.",
      checkedAt: null
    });
  }

  return createPreflightReport([], {
    status: "checking",
    summary: "Checking host paths and AI connection before the first turn.",
    checkedAt: null
  });
}

async function readModelIds(response: globalThis.Response): Promise<string[]> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: Array<{ id?: unknown }> }
    | null;

  if (!Array.isArray(payload?.data)) {
    return [];
  }

  return payload.data
    .map((item) => (typeof item?.id === "string" ? item.id : ""))
    .filter((item): item is string => Boolean(item));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildIssueDetails(details: RuntimePreflightIssueDetails): RuntimePreflightIssueDetails {
  return details;
}
