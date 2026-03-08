import type { EnvSource, RuntimePreflightCounts, RuntimePreflightIssue, RuntimePreflightReport } from "../types.js";
import type { ConfigLike, SafeConfigDiagnostics } from "./shared.js";
import { SUPPORTED_AI_PROVIDERS, buildPreflightIssue } from "./shared.js";
import { getAiEnvVarNames, getSafeConfigDiagnostics } from "./env.js";

function getProviderLabel(provider: string): string {
  if (provider === "litellm") return "LiteLLM";
  if (provider === "ollama") return "Ollama";
  return "the AI provider";
}

function getUrlExample(provider: string): string {
  if (provider === "litellm") return "http://127.0.0.1:4000";
  if (provider === "ollama") return "http://127.0.0.1:11434/v1";
  return "https://api.openai.com/v1";
}

function buildIssueFromConfigError(
  configToSummarize: ConfigLike,
  diagnostics: SafeConfigDiagnostics,
  error: ConfigLike["validation"]["errors"][number]
): RuntimePreflightIssue {
  const provider = configToSummarize.ai.provider;
  const detailSource =
    error.path === "profile"
      ? diagnostics.profile.source
      : error.path === "port"
      ? diagnostics.port.source
      : error.path === "ai.provider"
        ? diagnostics.provider.source
        : error.path === "ai.apiKey"
          ? diagnostics.ai.api_key.source
          : error.path === "ai.baseUrl"
            ? diagnostics.ai.base_url.source
            : error.path === "ai.chatModel"
              ? diagnostics.ai.chat_model.source
              : error.path === "ai.embeddingModel"
                ? diagnostics.ai.embedding_model.source
                : null;
  const detailValue =
    error.path === "profile"
      ? diagnostics.profile.value
      : error.path === "port"
      ? configToSummarize.port
      : error.path === "ai.provider"
        ? configToSummarize.ai.provider
        : error.path === "ai.apiKey"
          ? Boolean(configToSummarize.ai.apiKey)
          : error.path === "ai.baseUrl"
            ? configToSummarize.ai.baseUrl || null
            : error.path === "ai.chatModel"
              ? configToSummarize.ai.chatModel
              : error.path === "ai.embeddingModel"
                ? configToSummarize.ai.embeddingModel
                : null;
  const details = {
    check: "config",
    provider,
    config_path: error.path,
    config_source: detailSource,
    resolved_value: detailValue,
    notes: [`Validation code: ${error.code}`]
  };

  switch (error.code) {
    case "invalid_ai_profile":
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Choose a supported setup profile",
        message: "AI_PROFILE is set to a value this build does not recognize.",
        recovery: [
          "Use one of these values: hosted-default, local-gpu-small, local-gpu-large, custom.",
          "Save .env and start the app again."
        ],
        envVars: error.envVars,
        details
      });
    case "missing_api_key":
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Add an API key",
        message:
          provider === "openai-compatible"
            ? "The app does not have an API key for the configured AI provider yet."
            : `The ${getProviderLabel(provider)} setup is missing an API key.`,
        recovery:
          provider === "openai-compatible"
            ? [
                "Set AI_API_KEY in .env for your OpenAI-compatible provider.",
                "If you are using OpenAI directly, OPENAI_API_KEY still works.",
                "If you want the default gateway path instead, switch to AI_PROVIDER=litellm and point LITELLM_PROXY_URL at your LiteLLM proxy."
              ]
            : [
                `Add the missing key in .env for ${getProviderLabel(provider)}.`,
                "Restart the launcher after saving the file."
              ],
        envVars: error.envVars,
        details
      });
    case "unsupported_provider":
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Choose a supported AI provider",
        message: "AI_PROVIDER is set to a value this build does not recognize.",
        recovery: [
          `Use one of these values: ${SUPPORTED_AI_PROVIDERS.join(", ")}.`,
          "Save .env and start the app again."
        ],
        envVars: error.envVars,
        details
      });
    case "missing_chat_model":
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Choose a chat model",
        message: "The AI chat model name is missing, so the first story turn cannot start.",
        recovery: [
          "Set the chat model env var for your provider in .env.",
          "Use the provider-specific default alias if you are following the README setup."
        ],
        envVars: error.envVars,
        details
      });
    case "missing_embedding_model":
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Choose an embedding model",
        message: "The memory retrieval model name is missing.",
        recovery: [
          "Set the embedding model env var for your provider in .env.",
          "Use the provider-specific default alias if you are following the README setup."
        ],
        envVars: error.envVars,
        details
      });
    case "invalid_url":
    case "invalid_url_protocol":
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Fix the AI service URL",
        message: `${getProviderLabel(provider)} is configured with an invalid base URL.`,
        recovery: [
          `Use a full URL such as ${getUrlExample(provider)}.`,
          "If the app runs in Docker and the AI service runs on your PC, use host.docker.internal instead of localhost."
        ],
        envVars: error.envVars,
        details
      });
    case "invalid_port":
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Fix the app port",
        message: "PORT must be a whole number between 1 and 65535.",
        recovery: [
          "Update PORT in .env or remove it to use the default port 3000.",
          "Start the app again after saving the change."
        ],
        envVars: error.envVars,
        details
      });
    default:
      return buildPreflightIssue({
        code: error.code,
        severity: "blocker",
        area: "config",
        title: "Fix startup configuration",
        message: error.message,
        recovery: ["Update the listed env vars and restart the app."],
        envVars: error.envVars,
        details
      });
  }
}

function buildConfigAdvisoryIssues(
  configToSummarize: ConfigLike,
  diagnostics: SafeConfigDiagnostics
): RuntimePreflightIssue[] {
  const issues: RuntimePreflightIssue[] = [];

  if (diagnostics.provider.source === "inferred") {
    issues.push(
      buildPreflightIssue({
        code: "provider_inferred",
        severity: "info",
        area: "config",
        title: "Provider inferred from existing env vars",
        message: "AI_PROVIDER is not set, so the app inferred the provider from the other env vars it found.",
        recovery: ["Set AI_PROVIDER explicitly if you want startup and support checks to be easier to read later."],
        envVars: diagnostics.provider.env_var ? ["AI_PROVIDER", diagnostics.provider.env_var] : ["AI_PROVIDER"],
        details: {
          check: "config",
          provider: configToSummarize.ai.provider,
          config_path: "ai.provider",
          config_source: diagnostics.provider.source,
          resolved_value: configToSummarize.ai.provider,
          notes: diagnostics.provider.env_var ? [`Inference signal: ${diagnostics.provider.env_var}`] : []
        }
      })
    );
  }

  const legacyFields = [
    {
      source: diagnostics.ai.api_key.source,
      envVar: diagnostics.ai.api_key.env_var,
      label: "API key"
    },
    {
      source: diagnostics.ai.base_url.source,
      envVar: diagnostics.ai.base_url.env_var,
      label: "base URL"
    },
    {
      source: diagnostics.ai.chat_model.source,
      envVar: diagnostics.ai.chat_model.env_var,
      label: "chat model"
    },
    {
      source: diagnostics.ai.embedding_model.source,
      envVar: diagnostics.ai.embedding_model.env_var,
      label: "embedding model"
    }
  ].filter((field) => field.source === "legacy" && field.envVar);

  if (legacyFields.length) {
    issues.push(
      buildPreflightIssue({
        code: "legacy_env_vars_in_use",
        severity: "warning",
        area: "config",
        title: "Legacy OpenAI env names still drive startup",
        message: "Startup is working, but one or more AI settings still come from legacy OPENAI_* env vars.",
        recovery: ["Move those settings to the current AI_* or provider-specific env vars when you next touch the setup."],
        envVars: legacyFields.map((field) => field.envVar as string),
        details: {
          check: "config",
          provider: configToSummarize.ai.provider,
          config_source: "legacy",
          notes: legacyFields.map((field) => `${field.label}: ${field.envVar}`)
        }
      })
    );
  }

  if (diagnostics.profile_overrides.length) {
    issues.push(
      buildPreflightIssue({
        code: "profile_overrides_active",
        severity: "info",
        area: "config",
        title: "Advanced overrides are active",
        message: `The ${diagnostics.profile.label.toLowerCase()} profile is active, but one or more explicit env vars override it.`,
        recovery: [
          "Clear the listed override env vars if you want to return to the plain profile defaults."
        ],
        envVars: diagnostics.profile_overrides
          .map((override) => override.env_var)
          .filter((envVar): envVar is string => Boolean(envVar)),
        details: {
          check: "config",
          provider: configToSummarize.ai.provider,
          config_path: "profile_overrides",
          config_source: diagnostics.profile.source,
          notes: diagnostics.profile_overrides.map((override) => `${override.field}: ${override.source}`)
        }
      })
    );
  }

  return issues;
}

export function countPreflightIssues(issues: RuntimePreflightIssue[]): RuntimePreflightCounts {
  return issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    {
      blocker: 0,
      warning: 0,
      info: 0
    }
  );
}

export function hasBlockingPreflightIssue(issues: RuntimePreflightIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocker");
}

export function createPreflightReport(
  issues: RuntimePreflightIssue[],
  options: {
    status?: RuntimePreflightReport["status"];
    summary?: string;
    checkedAt?: string | null;
  } = {}
): RuntimePreflightReport {
  const counts = countPreflightIssues(issues);
  const defaultStatus =
    counts.blocker > 0 ? "action-required" : options.status === "checking" ? "checking" : "ready";
  const summary =
    options.summary ||
    (defaultStatus === "checking"
      ? "Checking startup requirements before the first turn."
      : counts.blocker > 0
        ? "Setup needs attention before the first turn can run."
        : counts.warning > 0
          ? "Setup is usable, but one or more warnings still need attention."
          : counts.info > 0
            ? "Setup looks ready. Extra notes are available if you want more detail."
            : "AI setup looks ready.");

  return {
    ok: counts.blocker === 0,
    status: defaultStatus,
    summary,
    issues,
    counts,
    checked_at: options.checkedAt === undefined ? new Date().toISOString() : options.checkedAt
  };
}

export function buildConfigPreflightIssues(
  configToSummarize: ConfigLike,
  env: EnvSource
): RuntimePreflightIssue[] {
  const diagnostics = getSafeConfigDiagnostics(configToSummarize, env);

  return [
    ...(configToSummarize.validation?.errors || []).map((error) =>
      buildIssueFromConfigError(configToSummarize, diagnostics, error)
    ),
    ...buildConfigAdvisoryIssues(configToSummarize, diagnostics)
  ];
}
