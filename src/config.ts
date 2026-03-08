import process from "node:process";
import type { AiConfig, AppConfig, ConfigError, EnvSource, PublicRuntimeConfig } from "./types.js";

const DEFAULT_PORT = 3000;

export const SUPPORTED_AI_PROVIDERS = ["openai-compatible", "litellm", "ollama"] as const;

type SupportedAiProvider = (typeof SUPPORTED_AI_PROVIDERS)[number];
type AiConfigField = "apiKey" | "baseUrl" | "chatModel" | "embeddingModel";
type ProviderDefaults = Omit<AiConfig, "provider">;
type ConfigLike = Pick<AppConfig, "port" | "ai" | "validation">;

const AI_ENV_VAR_CANDIDATES: Record<
  AiConfigField,
  {
    generic: string;
    legacy?: string;
    providerSpecific?: Partial<Record<SupportedAiProvider, string>>;
  }
> = {
  apiKey: {
    generic: "AI_API_KEY",
    legacy: "OPENAI_API_KEY",
    providerSpecific: {
      litellm: "LITELLM_API_KEY",
      ollama: "OLLAMA_API_KEY"
    }
  },
  baseUrl: {
    generic: "AI_BASE_URL",
    legacy: "OPENAI_BASE_URL",
    providerSpecific: {
      litellm: "LITELLM_PROXY_URL",
      ollama: "OLLAMA_BASE_URL"
    }
  },
  chatModel: {
    generic: "AI_CHAT_MODEL",
    legacy: "OPENAI_MODEL",
    providerSpecific: {
      litellm: "LITELLM_CHAT_MODEL",
      ollama: "OLLAMA_CHAT_MODEL"
    }
  },
  embeddingModel: {
    generic: "AI_EMBEDDING_MODEL",
    legacy: "OPENAI_EMBEDDING_MODEL",
    providerSpecific: {
      litellm: "LITELLM_EMBEDDING_MODEL",
      ollama: "OLLAMA_EMBEDDING_MODEL"
    }
  }
};

export interface RuntimePreflightIssue {
  code: string;
  severity: "error" | "warning";
  title: string;
  message: string;
  recovery: string[];
  env_vars: string[];
}

export type ConfigValueSource = "provider-specific" | "generic" | "legacy" | "default";
type ConfigEnvSource = "env" | "default" | "invalid-env" | "inferred";

export interface SafeConfigDiagnostics {
  provider: {
    value: string;
    source: ConfigEnvSource;
    env_var: string | null;
  };
  port: {
    value: number;
    source: ConfigEnvSource;
    env_var: string | null;
  };
  ai: {
    api_key: {
      configured: boolean;
      source: ConfigValueSource;
      env_var: string | null;
    };
    base_url: {
      value: string | null;
      source: ConfigValueSource;
      env_var: string | null;
    };
    chat_model: {
      value: string;
      source: ConfigValueSource;
      env_var: string | null;
    };
    embedding_model: {
      value: string;
      source: ConfigValueSource;
      env_var: string | null;
    };
  };
  validation: {
    ok: boolean;
    error_count: number;
  };
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

function isSupportedAiProvider(value: string): value is SupportedAiProvider {
  return SUPPORTED_AI_PROVIDERS.includes(value as SupportedAiProvider);
}

function readFirstEnvValue(
  env: EnvSource,
  keys: Array<string | undefined>
): { value: string | undefined; envVar: string | null } {
  for (const key of keys) {
    if (!key) continue;
    const value = env?.[key];
    if (typeof value === "string" && value.trim()) {
      return { value: value.trim(), envVar: key };
    }
  }

  return { value: undefined, envVar: null };
}

function classifyAiEnvVarSource(provider: string, field: AiConfigField, envVar: string | null): ConfigValueSource {
  if (!envVar) return "default";

  const providerSpecific = isSupportedAiProvider(provider)
    ? AI_ENV_VAR_CANDIDATES[field].providerSpecific?.[provider]
    : undefined;
  const generic = AI_ENV_VAR_CANDIDATES[field].generic;
  const legacy = AI_ENV_VAR_CANDIDATES[field].legacy;

  if (envVar === legacy) return "legacy";
  if (envVar === generic) return "generic";
  if (envVar === providerSpecific) return "provider-specific";
  return "generic";
}

export function getAiEnvVarNames(provider: string, field: AiConfigField): string[] {
  const candidates = AI_ENV_VAR_CANDIDATES[field];
  const providerSpecific = isSupportedAiProvider(provider)
    ? candidates.providerSpecific?.[provider]
    : undefined;

  return [providerSpecific, candidates.generic, candidates.legacy].filter(
    (value): value is string => Boolean(value)
  );
}

function resolveAiSetting(
  env: EnvSource,
  provider: string,
  field: AiConfigField,
  fallbackValue: string
): { value: string; source: ConfigValueSource; envVar: string | null } {
  const resolved = readFirstEnvValue(env, getAiEnvVarNames(provider, field));

  return {
    value: resolved.value ?? fallbackValue,
    source: classifyAiEnvVarSource(provider, field, resolved.envVar),
    envVar: resolved.envVar
  };
}

function inferProviderFromEnv(env: EnvSource): { value: string; envVar: string | null } | null {
  const litellmSignal = readFirstEnvValue(env, [
    "LITELLM_PROXY_URL",
    "LITELLM_API_KEY",
    "LITELLM_CHAT_MODEL",
    "LITELLM_EMBEDDING_MODEL"
  ]);
  if (litellmSignal.envVar) {
    return { value: "litellm", envVar: litellmSignal.envVar };
  }

  const ollamaSignal = readFirstEnvValue(env, [
    "OLLAMA_BASE_URL",
    "OLLAMA_API_KEY",
    "OLLAMA_CHAT_MODEL",
    "OLLAMA_EMBEDDING_MODEL"
  ]);
  if (ollamaSignal.envVar) {
    return { value: "ollama", envVar: ollamaSignal.envVar };
  }

  const directProviderSignal = readFirstEnvValue(env, [
    "AI_API_KEY",
    "AI_BASE_URL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "OPENAI_EMBEDDING_MODEL"
  ]);
  if (directProviderSignal.envVar) {
    return { value: "openai-compatible", envVar: directProviderSignal.envVar };
  }

  return null;
}

function resolveProvider(env: EnvSource): { value: string; source: ConfigEnvSource; envVar: string | null } {
  const resolved = readFirstEnvValue(env, ["AI_PROVIDER"]);
  if (resolved.envVar) {
    return {
      value: normalizeProvider(resolved.value),
      source: "env",
      envVar: resolved.envVar
    };
  }

  const inferred = inferProviderFromEnv(env);
  if (inferred) {
    return {
      value: inferred.value,
      source: "inferred",
      envVar: inferred.envVar
    };
  }

  return {
    value: "litellm",
    source: "default",
    envVar: null
  };
}

function resolvePort(env: EnvSource): { value: number; source: ConfigEnvSource; envVar: string | null } {
  const raw = readFirstEnvValue(env, ["PORT"]);
  const parsed = parsePort(raw.value);

  return {
    value: parsed.value,
    source: raw.envVar ? (parsed.errors.length ? "invalid-env" : "env") : "default",
    envVar: raw.envVar
  };
}

function normalizeProvider(value: string | undefined): string {
  if (!value || typeof value !== "string") return "litellm";
  return value.trim().toLowerCase() || "litellm";
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
                "If you want the default gateway path instead, switch to AI_PROVIDER=litellm and point LITELLM_PROXY_URL at your LiteLLM proxy."
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

  if (provider === "openai-compatible") {
    return {
      apiKey: "",
      baseUrl: "",
      chatModel: "gpt-4o-mini",
      embeddingModel: "text-embedding-3-small"
    };
  }

  return {
    apiKey: "anything",
    baseUrl: "http://127.0.0.1:4000",
    chatModel: "game-chat",
    embeddingModel: "game-embedding"
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

  if (!isSupportedAiProvider(ai.provider)) {
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
        envVars: getAiEnvVarNames(ai.provider, "apiKey"),
        code: "missing_api_key"
      })
    );
  }

  if (!ai.chatModel) {
    errors.push(
      buildConfigError({
        path: "ai.chatModel",
        message: "A chat model must be configured.",
        envVars: getAiEnvVarNames(ai.provider, "chatModel"),
        code: "missing_chat_model"
      })
    );
  }

  if (!ai.embeddingModel) {
    errors.push(
      buildConfigError({
        path: "ai.embeddingModel",
        message: "An embedding model must be configured.",
        envVars: getAiEnvVarNames(ai.provider, "embeddingModel"),
        code: "missing_embedding_model"
      })
    );
  }

  errors.push(
    ...validateHttpUrl(ai.baseUrl, {
      path: "ai.baseUrl",
      envVars: getAiEnvVarNames(ai.provider, "baseUrl")
    })
  );

  return errors;
}

function resolveAiConfig(env: EnvSource): AiConfig {
  const provider = resolveProvider(env).value;
  const defaults = getProviderDefaults(provider);
  const apiKey = resolveAiSetting(env, provider, "apiKey", defaults.apiKey);
  const baseUrl = resolveAiSetting(env, provider, "baseUrl", defaults.baseUrl);
  const chatModel = resolveAiSetting(env, provider, "chatModel", defaults.chatModel);
  const embeddingModel = resolveAiSetting(env, provider, "embeddingModel", defaults.embeddingModel);

  return {
    provider,
    apiKey: apiKey.value,
    baseUrl: normalizeBaseUrl(baseUrl.value),
    chatModel: chatModel.value,
    embeddingModel: embeddingModel.value
  };
}

export function getSafeConfigDiagnostics(
  configToSummarize: ConfigLike = config,
  env: EnvSource = process.env
): SafeConfigDiagnostics {
  const provider = resolveProvider(env);
  const port = resolvePort(env);
  const defaults = getProviderDefaults(configToSummarize.ai.provider);
  const apiKey = resolveAiSetting(env, configToSummarize.ai.provider, "apiKey", defaults.apiKey);
  const baseUrl = resolveAiSetting(env, configToSummarize.ai.provider, "baseUrl", defaults.baseUrl);
  const chatModel = resolveAiSetting(env, configToSummarize.ai.provider, "chatModel", defaults.chatModel);
  const embeddingModel = resolveAiSetting(
    env,
    configToSummarize.ai.provider,
    "embeddingModel",
    defaults.embeddingModel
  );

  return {
    provider: {
      value: configToSummarize.ai.provider,
      source: provider.source,
      env_var: provider.envVar
    },
    port: {
      value: configToSummarize.port,
      source: port.source,
      env_var: port.envVar
    },
    ai: {
      api_key: {
        configured: Boolean(configToSummarize.ai.apiKey),
        source: apiKey.source,
        env_var: apiKey.envVar
      },
      base_url: {
        value: configToSummarize.ai.baseUrl || null,
        source: baseUrl.source,
        env_var: baseUrl.envVar
      },
      chat_model: {
        value: configToSummarize.ai.chatModel,
        source: chatModel.source,
        env_var: chatModel.envVar
      },
      embedding_model: {
        value: configToSummarize.ai.embeddingModel,
        source: embeddingModel.source,
        env_var: embeddingModel.envVar
      }
    },
    validation: {
      ok: Boolean(configToSummarize.validation?.ok),
      error_count: configToSummarize.validation?.errors?.length || 0
    }
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
