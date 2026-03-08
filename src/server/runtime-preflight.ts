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
const LITELLM_PROXY_AUTH_ENV_VARS = ["LITELLM_API_KEY", "LITELLM_MASTER_KEY"];

interface JsonProbeResult {
  ok: boolean;
  status: number | null;
  body: unknown;
  text: string;
}

interface LiteLLMErrorPayload {
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
}

interface LiteLLMHealthEndpoint {
  model?: unknown;
  api_base?: unknown;
  error?: unknown;
  raw_request_typed_dict?: {
    raw_request_api_base?: unknown;
  } | null;
}

interface LiteLLMHealthPayload {
  unhealthy_endpoints?: LiteLLMHealthEndpoint[];
}

export interface RuntimePreflightService {
  getCurrentReport(): RuntimePreflightReport;
  ensureReport(options?: { force?: boolean }): Promise<RuntimePreflightReport>;
}

export function createRuntimePreflightService(
  config: AppConfig,
  cacheMs = DEFAULT_PREFLIGHT_CACHE_MS,
  getAdditionalIssues: () => RuntimePreflightIssue[] = () => []
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
    const additionalIssues = dedupeIssues(getAdditionalIssues());
    const baseIssues = dedupeIssues([...configIssues, ...additionalIssues]);

    if (hasBlockingPreflightIssue(baseIssues)) {
      runtimePreflight = createPreflightReport(baseIssues);
      return runtimePreflight;
    }

    const hostIssues = await probeHostPrerequisiteIssues();
    const storageIssues = dedupeIssues([...baseIssues, ...hostIssues]);
    if (hasBlockingPreflightIssue(storageIssues)) {
      runtimePreflight = createPreflightReport(storageIssues);
      return runtimePreflight;
    }

    const aiIssues = await probeAiRuntimeIssues();
    runtimePreflight = createPreflightReport(dedupeIssues([...storageIssues, ...aiIssues]));
    return runtimePreflight;
  }

  async function probeAiRuntimeIssues(): Promise<RuntimePreflightIssue[]> {
    const modelsUrl = getModelsUrl();
    if (!modelsUrl) {
      return [];
    }

    const modelsProbe = await fetchJsonProbe(modelsUrl);
    if (modelsProbe instanceof Error) {
      return [buildTransportIssue(modelsUrl, modelsProbe)];
    }

    const proxyAuthIssue = buildLiteLlmProxyAuthIssue(modelsProbe, modelsUrl);
    if (proxyAuthIssue) {
      return [proxyAuthIssue];
    }

    if (modelsProbe.status === 401 || modelsProbe.status === 403) {
      return [buildAuthIssue(modelsUrl, modelsProbe.status)];
    }

    if (modelsProbe.status === 404) {
      return [buildEndpointIssue("The configured AI service URL did not expose a models list.", modelsUrl, modelsProbe.status)];
    }

    if (!modelsProbe.ok) {
      return [
        buildEndpointIssue(
          buildProbeFailureMessage(modelsProbe),
          modelsUrl,
          modelsProbe.status,
          getProbeErrorMessage(modelsProbe)
        )
      ];
    }

    const modelIds = readModelIds(modelsProbe.body);
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

    if (config.ai.provider === "litellm") {
      issues.push(...(await probeLiteLlmHealthIssues()));
    }

    return dedupeIssues(issues);
  }

  async function probeLiteLlmHealthIssues(): Promise<RuntimePreflightIssue[]> {
    const healthUrl = getHealthUrl();
    if (!healthUrl) {
      return [];
    }

    const healthProbe = await fetchJsonProbe(healthUrl);
    if (healthProbe instanceof Error) {
      return [buildTransportIssue(healthUrl, healthProbe)];
    }

    const proxyAuthIssue = buildLiteLlmProxyAuthIssue(healthProbe, healthUrl);
    if (proxyAuthIssue) {
      return [proxyAuthIssue];
    }

    if (healthProbe.status === 401 || healthProbe.status === 403) {
      return [buildAuthIssue(healthUrl, healthProbe.status)];
    }

    if (healthProbe.status === 404) {
      return [];
    }

    if (!healthProbe.ok) {
      return [
        buildEndpointIssue(
          buildProbeFailureMessage(healthProbe),
          healthUrl,
          healthProbe.status,
          getProbeErrorMessage(healthProbe)
        )
      ];
    }

    return dedupeIssues(buildLiteLlmHealthIssues(healthProbe.body, healthUrl));
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

  function getHealthUrl(): string | null {
    if (config.ai.provider !== "litellm") {
      return null;
    }

    const baseUrl = config.ai.baseUrl;
    if (!baseUrl) {
      return null;
    }

    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL("health", normalizedBaseUrl).toString();
  }

  async function fetchJsonProbe(url: string): Promise<JsonProbeResult | Error> {
    try {
      const response = await fetch(url, {
        headers: buildModelsRequestHeaders(),
        signal: AbortSignal.timeout(5000)
      });
      const text = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        body: parseJson(text),
        text
      };
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  function buildLiteLlmProxyAuthIssue(probe: JsonProbeResult, probeTarget: string): RuntimePreflightIssue | null {
    if (config.ai.provider !== "litellm") {
      return null;
    }

    const errorMessage = getProbeErrorMessage(probe);
    if (probe.status !== 400 || !matchesAny(errorMessage, ["no connected db", "no_db_connection"])) {
      return null;
    }

    return {
      code: "litellm_proxy_auth_misconfigured",
      severity: "blocker",
      area: "ai",
      title: "Fix the LiteLLM proxy auth setup",
      message: "LiteLLM is running, but the app and proxy do not agree on the proxy API key setup.",
      recovery: [
        "Set LITELLM_MASTER_KEY to the same value as LITELLM_API_KEY, or clear both if you do not want LiteLLM proxy auth enabled.",
        "Restart the app after updating the LiteLLM proxy environment."
      ],
      recommended_fix:
        "Set LITELLM_MASTER_KEY to the same value as LITELLM_API_KEY, or clear both if you do not want LiteLLM proxy auth enabled.",
      env_vars: LITELLM_PROXY_AUTH_ENV_VARS,
      details: buildIssueDetails({
        check: "ai-models-probe",
        provider: config.ai.provider,
        probe_target: probeTarget,
        http_status: probe.status,
        notes: errorMessage ? [errorMessage] : []
      })
    };
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

  function buildTransportIssue(probeTarget: string, error: Error): RuntimePreflightIssue {
    const errorMessage = getErrorMessage(error);

    if (matchesAny(errorMessage, ["getaddrinfo", "enotfound", "name or service not known", "temporary failure in name resolution"])) {
      return {
        code: "ai_dns_lookup_failed",
        severity: "blocker",
        area: "ai",
        title: "Fix the AI service address",
        message: "The app could not resolve the hostname for the configured AI service.",
        recovery: [
          "Check the configured AI hostname and DNS settings, then retry startup.",
          "If the AI service runs on your PC while the app runs in Docker, use host.docker.internal instead of localhost."
        ],
        recommended_fix: "Check the configured AI hostname and DNS settings, then retry startup.",
        env_vars: getAiEnvVarNames(config.ai.provider, "baseUrl"),
        details: buildIssueDetails({
          check: "ai-models-probe",
          provider: config.ai.provider,
          probe_target: probeTarget,
          notes: [errorMessage]
        })
      };
    }

    if (matchesAny(errorMessage, ["tls", "ssl", "certificate"])) {
      return {
        code: "ai_tls_validation_failed",
        severity: "blocker",
        area: "ai",
        title: "Fix the AI TLS certificate",
        message: "The app reached the AI service, but TLS validation failed.",
        recovery: [
          "Check the AI service certificate chain or switch to a valid HTTPS endpoint.",
          "Retry startup after the certificate problem is fixed."
        ],
        recommended_fix: "Check the AI service certificate chain or switch to a valid HTTPS endpoint.",
        env_vars: getAiEnvVarNames(config.ai.provider, "baseUrl"),
        details: buildIssueDetails({
          check: "ai-models-probe",
          provider: config.ai.provider,
          probe_target: probeTarget,
          notes: [errorMessage]
        })
      };
    }

    if (matchesAny(errorMessage, ["proxy"])) {
      return {
        code: "ai_proxy_network_failed",
        severity: "blocker",
        area: "ai",
        title: "Fix the AI proxy connection",
        message: "The app could not connect through the configured AI proxy path.",
        recovery: [
          "Check the proxy settings and the configured AI base URL, then retry startup.",
          "If you do not need a proxy, point the app directly at the supported AI service URL."
        ],
        recommended_fix: "Check the proxy settings and the configured AI base URL, then retry startup.",
        env_vars: getAiEnvVarNames(config.ai.provider, "baseUrl"),
        details: buildIssueDetails({
          check: "ai-models-probe",
          provider: config.ai.provider,
          probe_target: probeTarget,
          notes: [errorMessage]
        })
      };
    }

    return buildEndpointIssue("The app could not reach the configured AI service URL.", probeTarget, null, error);
  }

  function buildAuthIssue(probeTarget: string, statusCode: number): RuntimePreflightIssue {
    if (config.ai.provider === "litellm") {
      return {
        code: "ai_proxy_auth_rejected",
        severity: "blocker",
        area: "ai",
        title: "Fix the LiteLLM proxy API key",
        message: "LiteLLM rejected the configured proxy API key during startup.",
        recovery: [
          "Check LITELLM_API_KEY in the app config and confirm it matches LITELLM_MASTER_KEY in the LiteLLM proxy environment.",
          "Restart the app after saving the updated proxy key settings."
        ],
        recommended_fix:
          "Check LITELLM_API_KEY in the app config and confirm it matches LITELLM_MASTER_KEY in the LiteLLM proxy environment.",
        env_vars: LITELLM_PROXY_AUTH_ENV_VARS,
        details: buildIssueDetails({
          check: "ai-models-probe",
          provider: config.ai.provider,
          probe_target: probeTarget,
          http_status: statusCode
        })
      };
    }

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

  function buildLiteLlmHealthIssues(payload: unknown, probeTarget: string): RuntimePreflightIssue[] {
    const unhealthyEndpoints = Array.isArray((payload as LiteLLMHealthPayload | null)?.unhealthy_endpoints)
      ? ((payload as LiteLLMHealthPayload).unhealthy_endpoints ?? [])
      : [];

    const issues = new Map<string, RuntimePreflightIssue>();
    for (const endpoint of unhealthyEndpoints) {
      const issue = classifyLiteLlmHealthIssue(endpoint, probeTarget);
      if (!issue) {
        continue;
      }

      const existing = issues.get(issue.code);
      if (!existing) {
        issues.set(issue.code, issue);
        continue;
      }

      const endpointModel = getEndpointModelName(endpoint);
      const notes = new Set([...(existing.details?.notes ?? [])]);
      if (endpointModel) {
        notes.add(`Affected upstream model: ${endpointModel}`);
      }

      existing.details = buildIssueDetails({
        ...(existing.details ?? {}),
        notes: Array.from(notes)
      });
    }

    return Array.from(issues.values());
  }

  function classifyLiteLlmHealthIssue(
    endpoint: LiteLLMHealthEndpoint,
    probeTarget: string
  ): RuntimePreflightIssue | null {
    const errorMessage = getEndpointErrorMessage(endpoint);
    if (!errorMessage) {
      return null;
    }

    const endpointModel = getEndpointModelName(endpoint);
    const endpointTarget = getEndpointTarget(endpoint);
    const notes = [
      endpointModel ? `Affected upstream model: ${endpointModel}` : "",
      summarizeDiagnosticNote(errorMessage)
    ].filter(Boolean);

    if (matchesAny(errorMessage, ["incorrect api key", "invalid_api_key", "authenticationerror", "auth_error"])) {
      return {
        code: "ai_upstream_auth_failed",
        severity: "blocker",
        area: "ai",
        title: "Fix the upstream AI credentials",
        message: "LiteLLM reached the upstream AI provider, but that provider rejected the configured credentials.",
        recovery: [
          "Update the upstream provider credentials used by LiteLLM, then rerun startup checks.",
          "If you are using the default hosted path in this repo, confirm OPENAI_API_KEY is set to a real provider key."
        ],
        recommended_fix:
          "Update the upstream provider credentials used by LiteLLM, then rerun startup checks.",
        env_vars: ["OPENAI_API_KEY"],
        details: buildIssueDetails({
          check: "litellm-health",
          provider: config.ai.provider,
          probe_target: probeTarget,
          notes
        })
      };
    }

    if (matchesAny(errorMessage, ["rate limit", "ratelimit", "too many requests", "429", "quota"])) {
      return {
        code: "ai_upstream_rate_limited",
        severity: "blocker",
        area: "ai",
        title: "Wait for the AI rate limit to recover",
        message: "LiteLLM reached the upstream provider, but that provider is rate-limiting requests right now.",
        recovery: [
          "Wait a moment and retry the startup check, or switch to a different supported provider route.",
          "If this keeps happening, check the upstream account limits configured behind LiteLLM."
        ],
        recommended_fix: "Wait a moment and retry the startup check, or switch to a different supported provider route.",
        env_vars: ["OPENAI_API_KEY"],
        details: buildIssueDetails({
          check: "litellm-health",
          provider: config.ai.provider,
          probe_target: probeTarget,
          notes
        })
      };
    }

    if (matchesAny(errorMessage, ["not found", "pulling it first", "pull it first", "not installed"])) {
      return {
        code: "local_model_missing",
        severity: "blocker",
        area: "ai",
        title: "Pull or switch the local model",
        message: "The selected local model is not installed on the local inference service yet.",
        recovery: [
          endpointModel
            ? `Pull ${endpointModel} into the local inference service, or switch back to the hosted default path.`
            : "Pull the selected local model into the local inference service, or switch back to the hosted default path.",
          "Retry startup after the model is available."
        ],
        recommended_fix:
          endpointModel
            ? `Pull ${endpointModel} into the local inference service, or switch back to the hosted default path.`
            : "Pull the selected local model into the local inference service, or switch back to the hosted default path.",
        env_vars: ["OLLAMA_CHAT_MODEL", "OLLAMA_EMBEDDING_MODEL"],
        details: buildIssueDetails({
          check: "litellm-health",
          provider: config.ai.provider,
          probe_target: endpointTarget || probeTarget,
          notes
        })
      };
    }

    if (matchesAny(errorMessage, ["cannot connect to host", "connection refused", "econnrefused"])) {
      const isLocalModelBackend = matchesAny(endpointTarget, ["11434", "ollama"]) || matchesAny(endpointModel, ["ollama/"]);
      return {
        code: isLocalModelBackend ? "local_model_backend_unreachable" : "ai_upstream_unreachable",
        severity: "blocker",
        area: "ai",
        title: isLocalModelBackend ? "Start the local model service" : "Fix the upstream AI connection",
        message: isLocalModelBackend
          ? "LiteLLM is up, but it could not reach the local model service behind the selected route."
          : "LiteLLM is up, but it could not reach one of the configured upstream AI services.",
        recovery: [
          isLocalModelBackend
            ? "Start the local model service or switch back to the hosted default path."
            : "Check the upstream AI service URL, network path, and provider status behind LiteLLM.",
          "Retry startup after the upstream service is reachable."
        ],
        recommended_fix: isLocalModelBackend
          ? "Start the local model service or switch back to the hosted default path."
          : "Check the upstream AI service URL, network path, and provider status behind LiteLLM.",
        env_vars: isLocalModelBackend ? ["OLLAMA_BASE_URL"] : ["LITELLM_PROXY_URL"],
        details: buildIssueDetails({
          check: "litellm-health",
          provider: config.ai.provider,
          probe_target: endpointTarget || probeTarget,
          notes
        })
      };
    }

    if (matchesAny(errorMessage, ["getaddrinfo", "enotfound", "name or service not known", "temporary failure in name resolution"])) {
      return {
        code: "ai_dns_lookup_failed",
        severity: "blocker",
        area: "ai",
        title: "Fix the AI service address",
        message: "LiteLLM could not resolve the hostname for one of the configured AI services.",
        recovery: [
          "Check the configured hostname or DNS settings for the upstream AI route behind LiteLLM.",
          "Retry startup after the hostname resolves correctly."
        ],
        recommended_fix: "Check the configured hostname or DNS settings for the upstream AI route behind LiteLLM.",
        env_vars: ["LITELLM_PROXY_URL"],
        details: buildIssueDetails({
          check: "litellm-health",
          provider: config.ai.provider,
          probe_target: endpointTarget || probeTarget,
          notes
        })
      };
    }

    if (matchesAny(errorMessage, ["tls", "ssl", "certificate"])) {
      return {
        code: "ai_tls_validation_failed",
        severity: "blocker",
        area: "ai",
        title: "Fix the AI TLS certificate",
        message: "LiteLLM reached an upstream AI service, but TLS validation failed.",
        recovery: [
          "Check the upstream certificate chain or switch the route to a valid HTTPS endpoint.",
          "Retry startup after the TLS issue is fixed."
        ],
        recommended_fix: "Check the upstream certificate chain or switch the route to a valid HTTPS endpoint.",
        env_vars: ["LITELLM_PROXY_URL"],
        details: buildIssueDetails({
          check: "litellm-health",
          provider: config.ai.provider,
          probe_target: endpointTarget || probeTarget,
          notes
        })
      };
    }

    return {
      code: "ai_upstream_unhealthy",
      severity: "blocker",
      area: "ai",
      title: "Fix the upstream AI route",
      message: "LiteLLM is running, but one or more upstream AI routes failed their health checks.",
      recovery: [
        "Inspect the LiteLLM health details, fix the failing upstream route, and retry startup.",
        "If you only need the hosted default path, switch away from the failing optional override."
      ],
      recommended_fix: "Inspect the LiteLLM health details, fix the failing upstream route, and retry startup.",
      env_vars: ["LITELLM_PROXY_URL"],
      details: buildIssueDetails({
        check: "litellm-health",
        provider: config.ai.provider,
        probe_target: endpointTarget || probeTarget,
        notes
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

function readModelIds(payload: unknown): string[] {
  if (!Array.isArray((payload as { data?: Array<{ id?: unknown }> } | null)?.data)) {
    return [];
  }

  return (payload as { data: Array<{ id?: unknown }> }).data
    .map((item) => (typeof item?.id === "string" ? item.id : ""))
    .filter((item): item is string => Boolean(item));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const messages = [error.message];
    const causeMessage = getCauseMessage(error.cause);
    if (causeMessage) {
      messages.push(causeMessage);
    }
    return messages.filter(Boolean).join(" | ");
  }

  return String(error);
}

function getCauseMessage(cause: unknown): string {
  if (!cause || typeof cause !== "object") {
    return "";
  }

  const causeRecord = cause as Record<string, unknown>;
  const code = typeof causeRecord.code === "string" ? causeRecord.code : "";
  const message = typeof causeRecord.message === "string" ? causeRecord.message : "";

  return [code, message].filter(Boolean).join(": ");
}

function parseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getProbeErrorMessage(probe: JsonProbeResult): string {
  const payload = probe.body as LiteLLMErrorPayload | null;
  if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
    return payload.error.message.trim();
  }

  return probe.text.trim();
}

function buildProbeFailureMessage(probe: JsonProbeResult): string {
  const errorMessage = getProbeErrorMessage(probe);
  if (errorMessage) {
    return errorMessage;
  }

  return `The AI service responded with HTTP ${probe.status ?? "unknown"} during startup.`;
}

function matchesAny(value: string | null | undefined, patterns: string[]): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function dedupeIssues(issues: RuntimePreflightIssue[]): RuntimePreflightIssue[] {
  const unique = new Map<string, RuntimePreflightIssue>();
  for (const issue of issues) {
    if (!unique.has(issue.code)) {
      unique.set(issue.code, issue);
    }
  }

  return Array.from(unique.values());
}

function getEndpointErrorMessage(endpoint: LiteLLMHealthEndpoint): string {
  return typeof endpoint.error === "string" ? endpoint.error.trim() : "";
}

function getEndpointModelName(endpoint: LiteLLMHealthEndpoint): string {
  return typeof endpoint.model === "string" ? endpoint.model : "";
}

function getEndpointTarget(endpoint: LiteLLMHealthEndpoint): string {
  if (typeof endpoint.api_base === "string" && endpoint.api_base) {
    return endpoint.api_base;
  }

  if (typeof endpoint.raw_request_typed_dict?.raw_request_api_base === "string") {
    return endpoint.raw_request_typed_dict.raw_request_api_base;
  }

  return "";
}

function summarizeDiagnosticNote(message: string): string {
  const firstLine = message.split(/\r?\n/u, 1)[0]?.trim() || "";
  if (!firstLine) {
    return "";
  }

  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}...` : firstLine;
}

function buildIssueDetails(details: RuntimePreflightIssueDetails): RuntimePreflightIssueDetails {
  return details;
}
