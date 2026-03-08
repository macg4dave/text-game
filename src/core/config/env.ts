import type { AiConfig, EnvSource, LoggingConfig, PublicRuntimeConfig } from "../types.js";
import type { SafeConfigDiagnostics, ConfigEnvSource, ConfigLike, ConfigValueSource, AiConfigField } from "./shared.js";
import {
  AI_ENV_VAR_CANDIDATES,
  classifyAiEnvVarSource,
  getProviderDefaults,
  isSupportedAiProvider,
  normalizeBaseUrl,
  normalizeProvider,
  readFirstEnvValue
} from "./shared.js";
import { parseLogLevel, parsePort, validateAiConfig } from "./validation.js";

export function getAiEnvVarNames(provider: string, field: AiConfigField): string[] {
  const candidates = AI_ENV_VAR_CANDIDATES[field];
  const providerSpecific = isSupportedAiProvider(provider)
    ? candidates.providerSpecific?.[provider]
    : undefined;

  return [providerSpecific, candidates.generic, candidates.legacy].filter(
    (value): value is string => Boolean(value)
  );
}

export function resolveAiSetting(
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

export function inferProviderFromEnv(env: EnvSource): { value: string; envVar: string | null } | null {
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

export function resolveProvider(env: EnvSource): { value: string; source: ConfigEnvSource; envVar: string | null } {
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

export function resolvePort(env: EnvSource): { value: number; source: ConfigEnvSource; envVar: string | null } {
  const raw = readFirstEnvValue(env, ["PORT"]);
  const parsed = parsePort(raw.value);

  return {
    value: parsed.value,
    source: raw.envVar ? (parsed.errors.length ? "invalid-env" : "env") : "default",
    envVar: raw.envVar
  };
}

export function resolveLogLevel(env: EnvSource): { value: LoggingConfig["level"]; source: ConfigEnvSource; envVar: string | null } {
  const raw = readFirstEnvValue(env, ["LOG_LEVEL"]);
  const parsed = parseLogLevel(raw.value);

  return {
    value: parsed.value,
    source: raw.envVar ? (parsed.errors.length ? "invalid-env" : "env") : "default",
    envVar: raw.envVar
  };
}

export function resolveAiConfig(env: EnvSource): AiConfig {
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
  configToSummarize: ConfigLike,
  env: EnvSource
): SafeConfigDiagnostics {
  const provider = resolveProvider(env);
  const port = resolvePort(env);
  const logLevel = resolveLogLevel(env);
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
    logging: {
      level: {
        value: configToSummarize.logging.level,
        source: logLevel.source,
        env_var: logLevel.envVar
      }
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
    log_level: configToSummarize.logging.level,
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

export function loadConfig(env: EnvSource): {
  port: number;
  ai: AiConfig;
  logging: LoggingConfig;
  validation: {
    ok: boolean;
    errors: ReturnType<typeof validateAiConfig>;
  };
  runtime: PublicRuntimeConfig;
} {
  const portResult = parsePort(readFirstEnvValue(env, ["PORT"]).value);
  const logLevelResult = parseLogLevel(readFirstEnvValue(env, ["LOG_LEVEL"]).value);
  const ai = resolveAiConfig(env);
  const loadedConfig = {
    port: portResult.value,
    ai,
    logging: {
      level: logLevelResult.value
    },
    validation: {
      ok: false,
      errors: [...portResult.errors, ...logLevelResult.errors, ...validateAiConfig(ai)]
    }
  };

  loadedConfig.validation.ok = loadedConfig.validation.errors.length === 0;

  return {
    ...loadedConfig,
    runtime: getPublicRuntimeConfig(loadedConfig)
  };
}
