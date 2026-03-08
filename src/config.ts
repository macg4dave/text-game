import process from "node:process";
import type { AiConfig, AppConfig, ConfigError, EnvSource, PublicRuntimeConfig } from "./types.js";

const DEFAULT_PORT = 3000;

export const SUPPORTED_AI_PROVIDERS = ["openai-compatible", "litellm", "ollama"] as const;

type ProviderDefaults = Omit<AiConfig, "provider">;
type ConfigLike = Pick<AppConfig, "port" | "ai" | "validation">;

export interface RuntimePreflightIssue {
  code: string;
  severity: "error" | "warning";
  title: string;
  message: string;
  recovery: string[];
  env_vars: string[];
}

function readEnv(env: EnvSource, ...keys: Array<string | undefined>): string | undefined {
  for (const key of keys) {
    if (!key) continue;
    const value = env?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeProvider(value: string | undefined): string {
  if (!value || typeof value !== "string") return "openai-compatible";
  return value.trim().toLowerCase() || "openai-compatible";
}

function normalizeBaseUrl(value: string | undefined): string {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function buildConfigError({
  path,
  message,
  envVars = [],
  code = "invalid"
}: {
  path: string;
  message: string;
  envVars?: string[];
  code?: string;
}): ConfigError {
  return {
    path,
    message,
    envVars,
    code
  };
}

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

function buildIssueFromConfigError(configToSummarize: ConfigLike, error: ConfigError): RuntimePreflightIssue {
  const provider = configToSummarize.ai.provider;

  switch (error.code) {
    case "missing_api_key":
      return {
        code: error.code,
        severity: "error",
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
                "If you meant to use LiteLLM or Ollama, set AI_PROVIDER first so the right defaults apply."
              ]
            : [
                `Add the missing key in .env for ${getProviderLabel(provider)}.`,
                "Restart the launcher after saving the file."
              ],
        env_vars: error.envVars
      };
    case "unsupported_provider":
      return {
        code: error.code,
        severity: "error",
        title: "Choose a supported AI provider",
        message: "AI_PROVIDER is set to a value this build does not recognize.",
        recovery: [
          `Use one of these values: ${SUPPORTED_AI_PROVIDERS.join(", ")}.`,
          "Save .env and start the app again."
        ],
        env_vars: error.envVars
      };
    case "missing_chat_model":
      return {
        code: error.code,
        severity: "error",
        title: "Choose a chat model",
        message: "The AI chat model name is missing, so the first story turn cannot start.",
        recovery: [
          "Set the chat model env var for your provider in .env.",
          "Use the provider-specific default alias if you are following the README setup."
        ],
        env_vars: error.envVars
      };
    case "missing_embedding_model":
      return {
        code: error.code,
        severity: "error",
        title: "Choose an embedding model",
        message: "The memory retrieval model name is missing.",
        recovery: [
          "Set the embedding model env var for your provider in .env.",
          "Use the provider-specific default alias if you are following the README setup."
        ],
        env_vars: error.envVars
      };
    case "invalid_url":
    case "invalid_url_protocol":
      return {
        code: error.code,
        severity: "error",
        title: "Fix the AI service URL",
        message: `${getProviderLabel(provider)} is configured with an invalid base URL.`,
        recovery: [
          `Use a full URL such as ${getUrlExample(provider)}.`,
          "If the app runs in Docker and the AI service runs on your PC, use host.docker.internal instead of localhost."
        ],
        env_vars: error.envVars
      };
    case "invalid_port":
      return {
        code: error.code,
        severity: "error",
        title: "Fix the app port",
        message: "PORT must be a whole number between 1 and 65535.",
        recovery: [
          "Update PORT in .env or remove it to use the default port 3000.",
          "Start the app again after saving the change."
        ],
        env_vars: error.envVars
      };
    default:
      return {
        code: error.code,
        severity: "error",
        title: "Fix startup configuration",
        message: error.message,
        recovery: ["Update the listed env vars and restart the app."],
        env_vars: error.envVars
      };
  }
}

function getProviderDefaults(provider: string): ProviderDefaults {
  if (provider === "litellm") {
    return {
      apiKey: "anything",
      baseUrl: "http://127.0.0.1:4000",
      chatModel: "game-chat",
      embeddingModel: "game-embedding"
    };
  }

  if (provider === "ollama") {
    return {
      apiKey: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      chatModel: "gemma3:4b",
      embeddingModel: "embeddinggemma"
    };
  }

  return {
    apiKey: "",
    baseUrl: "",
    chatModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small"
  };
}

function parsePort(value: string | undefined): { value: number; errors: ConfigError[] } {
  if (value === undefined) {
    return { value: DEFAULT_PORT, errors: [] };
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return { value: DEFAULT_PORT, errors: [] };
  }

  const port = Number.parseInt(normalized, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      value: DEFAULT_PORT,
      errors: [
        buildConfigError({
          path: "port",
          message: "PORT must be an integer between 1 and 65535.",
          envVars: ["PORT"],
          code: "invalid_port"
        })
      ]
    };
  }

  return { value: port, errors: [] };
}

function validateHttpUrl(
  value: string,
  { path, envVars }: { path: string; envVars: string[] }
): ConfigError[] {
  if (!value) return [];

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return [
        buildConfigError({
          path,
          message: "Base URLs must start with http:// or https://.",
          envVars,
          code: "invalid_url_protocol"
        })
      ];
    }
  } catch {
    return [
      buildConfigError({
        path,
        message: "Base URL must be a valid absolute URL.",
        envVars,
        code: "invalid_url"
      })
    ];
  }

  return [];
}

function validateAiConfig(ai: AiConfig): ConfigError[] {
  const errors: ConfigError[] = [];

  if (!SUPPORTED_AI_PROVIDERS.includes(ai.provider as (typeof SUPPORTED_AI_PROVIDERS)[number])) {
    errors.push(
      buildConfigError({
        path: "ai.provider",
        message: `AI_PROVIDER must be one of: ${SUPPORTED_AI_PROVIDERS.join(", ")}.`,
        envVars: ["AI_PROVIDER"],
        code: "unsupported_provider"
      })
    );
  }

  if (ai.provider === "openai-compatible" && !ai.apiKey) {
    errors.push(
      buildConfigError({
        path: "ai.apiKey",
        message: "AI_API_KEY is required when AI_PROVIDER is openai-compatible.",
        envVars: ["AI_API_KEY", "OPENAI_API_KEY"],
        code: "missing_api_key"
      })
    );
  }

  if (!ai.chatModel) {
    errors.push(
      buildConfigError({
        path: "ai.chatModel",
        message: "A chat model must be configured.",
        envVars: ["AI_CHAT_MODEL", "OPENAI_MODEL", "LITELLM_CHAT_MODEL", "OLLAMA_CHAT_MODEL"],
        code: "missing_chat_model"
      })
    );
  }

  if (!ai.embeddingModel) {
    errors.push(
      buildConfigError({
        path: "ai.embeddingModel",
        message: "An embedding model must be configured.",
        envVars: [
          "AI_EMBEDDING_MODEL",
          "OPENAI_EMBEDDING_MODEL",
          "LITELLM_EMBEDDING_MODEL",
          "OLLAMA_EMBEDDING_MODEL"
        ],
        code: "missing_embedding_model"
      })
    );
  }

  const baseUrlEnvVars =
    ai.provider === "litellm"
      ? ["LITELLM_PROXY_URL", "AI_BASE_URL", "OPENAI_BASE_URL"]
      : ai.provider === "ollama"
        ? ["OLLAMA_BASE_URL", "AI_BASE_URL", "OPENAI_BASE_URL"]
        : ["AI_BASE_URL", "OPENAI_BASE_URL"];

  errors.push(...validateHttpUrl(ai.baseUrl, { path: "ai.baseUrl", envVars: baseUrlEnvVars }));

  return errors;
}

function resolveAiConfig(env: EnvSource): AiConfig {
  const provider = normalizeProvider(readEnv(env, "AI_PROVIDER"));
  const defaults = getProviderDefaults(provider);

  return {
    provider,
    apiKey:
      readEnv(
        env,
        provider === "litellm" ? "LITELLM_API_KEY" : undefined,
        provider === "ollama" ? "OLLAMA_API_KEY" : undefined,
        "AI_API_KEY",
        "OPENAI_API_KEY"
      ) || defaults.apiKey,
    baseUrl: normalizeBaseUrl(
      readEnv(
        env,
        provider === "litellm" ? "LITELLM_PROXY_URL" : undefined,
        provider === "ollama" ? "OLLAMA_BASE_URL" : undefined,
        "AI_BASE_URL",
        "OPENAI_BASE_URL"
      ) || defaults.baseUrl
    ),
    chatModel:
      readEnv(
        env,
        provider === "litellm" ? "LITELLM_CHAT_MODEL" : undefined,
        provider === "ollama" ? "OLLAMA_CHAT_MODEL" : undefined,
        "AI_CHAT_MODEL",
        "OPENAI_MODEL"
      ) || defaults.chatModel,
    embeddingModel:
      readEnv(
        env,
        provider === "litellm" ? "LITELLM_EMBEDDING_MODEL" : undefined,
        provider === "ollama" ? "OLLAMA_EMBEDDING_MODEL" : undefined,
        "AI_EMBEDDING_MODEL",
        "OPENAI_EMBEDDING_MODEL"
      ) || defaults.embeddingModel
  };
}

export function getPublicRuntimeConfig(configToSummarize: ConfigLike): PublicRuntimeConfig {
  return {
    port: configToSummarize.port,
    provider: configToSummarize.ai.provider,
    chat_model: configToSummarize.ai.chatModel,
    embedding_model: configToSummarize.ai.embeddingModel,
    base_url: configToSummarize.ai.baseUrl || null,
    api_key_configured: Boolean(configToSummarize.ai.apiKey),
    validation: {
      ok: Boolean(configToSummarize.validation?.ok),
      errors: (configToSummarize.validation?.errors || []).map((error) => ({
        path: error.path,
        message: error.message,
        env_vars: error.envVars
      }))
    }
  };
}

export function buildConfigPreflightIssues(configToSummarize: ConfigLike): RuntimePreflightIssue[] {
  return (configToSummarize.validation?.errors || []).map((error) =>
    buildIssueFromConfigError(configToSummarize, error)
  );
}

export function formatConfigErrors(errors: ConfigError[] = []): string {
  if (!errors.length) return "Configuration is valid.";

  return errors
    .map((error) => {
      const envVars = error.envVars.length ? ` (env: ${error.envVars.join(", ")})` : "";
      return `- ${error.path}: ${error.message}${envVars}`;
    })
    .join("\n");
}

export class ConfigValidationError extends Error {
  errors: ConfigError[];

  constructor(errors: ConfigError[]) {
    super(`Invalid runtime configuration:\n${formatConfigErrors(errors)}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

export function assertValidConfig(configToValidate: AppConfig = config): AppConfig {
  const errors = configToValidate.validation.errors || [];
  if (configToValidate.validation.ok) return configToValidate;
  throw new ConfigValidationError(errors);
}

export function loadConfig(env: EnvSource = process.env): AppConfig {
  const portResult = parsePort(readEnv(env, "PORT"));
  const ai = resolveAiConfig(env);
  const loadedConfig = {
    port: portResult.value,
    ai,
    validation: {
      ok: false,
      errors: [...portResult.errors, ...validateAiConfig(ai)]
    }
  };

  loadedConfig.validation.ok = loadedConfig.validation.errors.length === 0;

  return {
    ...loadedConfig,
    runtime: getPublicRuntimeConfig(loadedConfig)
  };
}

export const config = loadConfig();
