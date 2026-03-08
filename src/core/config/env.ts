import type { AiConfig, ConfigProfileSelection, EnvSource, LoggingConfig, PublicRuntimeConfig } from "../types.js";
import type {
  AiConfigField,
  ConfigEnvSource,
  ConfigLike,
  ConfigProfileDefinition,
  ConfigValueSource,
  ProfileOverrideDiagnostic,
  SafeConfigDiagnostics
} from "./shared.js";
import {
  AI_ENV_VAR_CANDIDATES,
  classifyAiEnvVarSource,
  getConfigProfileDefinition,
  getProviderDefaults,
  isSupportedAiProvider,
  normalizeBaseUrl,
  normalizeProvider,
  readFirstEnvValue
} from "./shared.js";
import { parseAiProfile, parseLogLevel, parsePort, validateAiConfig } from "./validation.js";

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
  fallbackValue: string,
  profile: ConfigProfileSelection,
  profileDefinition: ConfigProfileDefinition = getConfigProfileDefinition(profile.id)
): { value: string; source: ConfigValueSource; envVar: string | null } {
  const resolved = readFirstEnvValue(env, getAiEnvVarNames(provider, field));

  if (resolved.envVar) {
    return {
      value: resolved.value ?? fallbackValue,
      source: classifyAiEnvVarSource(provider, field, resolved.envVar),
      envVar: resolved.envVar
    };
  }

  if (canApplyProfileDefaults(profile)) {
    const profileValue = profileDefinition.defaults?.[field];
    if (typeof profileValue === "string" && profileValue.trim()) {
      return {
        value: profileValue.trim(),
        source: "profile",
        envVar: "AI_PROFILE"
      };
    }
  }

  return {
    value: fallbackValue,
    source: "default",
    envVar: null
  };
}

export function resolveProfile(env: EnvSource): ConfigProfileSelection {
  const raw = readFirstEnvValue(env, ["AI_PROFILE"]);
  const parsed = parseAiProfile(raw.value);
  const definition = getConfigProfileDefinition(parsed.value);

  return {
    ...definition,
    source: raw.envVar ? (parsed.errors.length ? "invalid-env" : "env") : "default",
    envVar: raw.envVar
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

export function resolveProvider(
  env: EnvSource,
  profile: ConfigProfileSelection = resolveProfile(env)
): { value: string; source: ConfigEnvSource; envVar: string | null } {
  const resolved = readFirstEnvValue(env, ["AI_PROVIDER"]);
  if (resolved.envVar) {
    return {
      value: normalizeProvider(resolved.value),
      source: "env",
      envVar: resolved.envVar
    };
  }

  if (canApplyProfileDefaults(profile)) {
    const profileDefinition = getConfigProfileDefinition(profile.id);
    const profileProvider = profileDefinition.defaults?.provider;
    if (profileProvider) {
      return {
        value: profileProvider,
        source: "profile",
        envVar: "AI_PROFILE"
      };
    }
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
  const profile = resolveProfile(env);
  const profileDefinition = getConfigProfileDefinition(profile.id);
  const provider = resolveProvider(env, profile).value;
  const defaults = getProviderDefaults(provider);
  const apiKey = resolveAiSetting(env, provider, "apiKey", defaults.apiKey, profile, profileDefinition);
  const baseUrl = resolveAiSetting(env, provider, "baseUrl", defaults.baseUrl, profile, profileDefinition);
  const chatModel = resolveAiSetting(env, provider, "chatModel", defaults.chatModel, profile, profileDefinition);
  const embeddingModel = resolveAiSetting(
    env,
    provider,
    "embeddingModel",
    defaults.embeddingModel,
    profile,
    profileDefinition
  );

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
  const profile = resolveProfile(env);
  const profileDefinition = getConfigProfileDefinition(profile.id);
  const provider = resolveProvider(env, profile);
  const port = resolvePort(env);
  const logLevel = resolveLogLevel(env);
  const defaults = getProviderDefaults(configToSummarize.ai.provider);
  const apiKey = resolveAiSetting(
    env,
    configToSummarize.ai.provider,
    "apiKey",
    defaults.apiKey,
    profile,
    profileDefinition
  );
  const baseUrl = resolveAiSetting(
    env,
    configToSummarize.ai.provider,
    "baseUrl",
    defaults.baseUrl,
    profile,
    profileDefinition
  );
  const chatModel = resolveAiSetting(
    env,
    configToSummarize.ai.provider,
    "chatModel",
    defaults.chatModel,
    profile,
    profileDefinition
  );
  const embeddingModel = resolveAiSetting(
    env,
    configToSummarize.ai.provider,
    "embeddingModel",
    defaults.embeddingModel,
    profile,
    profileDefinition
  );
  const profileOverrides = buildProfileOverrides({
    profile,
    profileDefinition,
    config: configToSummarize,
    provider,
    apiKey,
    baseUrl,
    chatModel,
    embeddingModel
  });

  return {
    profile: {
      value: profile.id,
      label: profile.label,
      description: profile.description,
      recommended_ai_stack: profile.recommendedAiStack,
      source: profile.source,
      env_var: profile.envVar
    },
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
    },
    profile_overrides: profileOverrides
  };
}

export function getPublicRuntimeConfig(configToSummarize: ConfigLike, env: EnvSource): PublicRuntimeConfig {
  const diagnostics = getSafeConfigDiagnostics(configToSummarize, env);

  return {
    port: configToSummarize.port,
    provider: configToSummarize.ai.provider,
    chat_model: configToSummarize.ai.chatModel,
    embedding_model: configToSummarize.ai.embeddingModel,
    base_url: configToSummarize.ai.baseUrl || null,
    api_key_configured: Boolean(configToSummarize.ai.apiKey),
    log_level: configToSummarize.logging.level,
    profile: {
      id: configToSummarize.profile.id,
      label: configToSummarize.profile.label,
      description: configToSummarize.profile.description,
      recommended_ai_stack: configToSummarize.profile.recommendedAiStack,
      override_count: diagnostics.profile_overrides.length
    },
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
  profile: ConfigProfileSelection;
  ai: AiConfig;
  logging: LoggingConfig;
  validation: {
    ok: boolean;
    errors: ReturnType<typeof validateAiConfig>;
  };
  runtime: PublicRuntimeConfig;
} {
  const profileResult = parseAiProfile(readFirstEnvValue(env, ["AI_PROFILE"]).value);
  const profile = resolveProfile(env);
  const portResult = parsePort(readFirstEnvValue(env, ["PORT"]).value);
  const logLevelResult = parseLogLevel(readFirstEnvValue(env, ["LOG_LEVEL"]).value);
  const ai = resolveAiConfig(env);
  const loadedConfig = {
    port: portResult.value,
    profile,
    ai,
    logging: {
      level: logLevelResult.value
    },
    validation: {
      ok: false,
      errors: [...profileResult.errors, ...portResult.errors, ...logLevelResult.errors, ...validateAiConfig(ai)]
    }
  };

  loadedConfig.validation.ok = loadedConfig.validation.errors.length === 0;

  return {
    ...loadedConfig,
    runtime: getPublicRuntimeConfig(loadedConfig, env)
  };
}

function canApplyProfileDefaults(profile: ConfigProfileSelection): boolean {
  return profile.source === "env" && profile.id !== "custom";
}

function buildProfileOverrides({
  profile,
  profileDefinition,
  config,
  provider,
  apiKey,
  baseUrl,
  chatModel,
  embeddingModel
}: {
  profile: ConfigProfileSelection;
  profileDefinition: ConfigProfileDefinition;
  config: ConfigLike;
  provider: { source: ConfigEnvSource; envVar: string | null };
  apiKey: { source: ConfigValueSource; envVar: string | null };
  baseUrl: { source: ConfigValueSource; envVar: string | null };
  chatModel: { source: ConfigValueSource; envVar: string | null };
  embeddingModel: { source: ConfigValueSource; envVar: string | null };
}): ProfileOverrideDiagnostic[] {
  const overrides: ProfileOverrideDiagnostic[] = [];

  if (profile.source !== "env") {
    return overrides;
  }

  if (profile.id === "custom") {
    pushProfileOverride(overrides, "ai.provider", provider.source, provider.envVar);
    pushProfileOverride(overrides, "ai.api_key", apiKey.source, apiKey.envVar);
    pushProfileOverride(overrides, "ai.base_url", baseUrl.source, baseUrl.envVar);
    pushProfileOverride(overrides, "ai.chat_model", chatModel.source, chatModel.envVar);
    pushProfileOverride(overrides, "ai.embedding_model", embeddingModel.source, embeddingModel.envVar);
    return overrides;
  }

  pushProfileOverrideIfChanged(
    overrides,
    "ai.provider",
    provider.source,
    provider.envVar,
    config.ai.provider,
    profileDefinition.defaults?.provider || null
  );
  pushProfileOverrideIfChanged(
    overrides,
    "ai.api_key",
    apiKey.source,
    apiKey.envVar,
    config.ai.apiKey,
    profileDefinition.defaults?.apiKey || null
  );
  pushProfileOverrideIfChanged(
    overrides,
    "ai.base_url",
    baseUrl.source,
    baseUrl.envVar,
    config.ai.baseUrl || null,
    profileDefinition.defaults?.baseUrl || null
  );
  pushProfileOverrideIfChanged(
    overrides,
    "ai.chat_model",
    chatModel.source,
    chatModel.envVar,
    config.ai.chatModel,
    profileDefinition.defaults?.chatModel || null
  );
  pushProfileOverrideIfChanged(
    overrides,
    "ai.embedding_model",
    embeddingModel.source,
    embeddingModel.envVar,
    config.ai.embeddingModel,
    profileDefinition.defaults?.embeddingModel || null
  );

  return overrides;
}

function pushProfileOverride(
  overrides: ProfileOverrideDiagnostic[],
  field: ProfileOverrideDiagnostic["field"],
  source: ProfileOverrideDiagnostic["source"],
  envVar: string | null
): void {
  if (source === "default" || source === "profile") {
    return;
  }

  overrides.push({
    field,
    source,
    env_var: envVar
  });
}

function pushProfileOverrideIfChanged(
  overrides: ProfileOverrideDiagnostic[],
  field: ProfileOverrideDiagnostic["field"],
  source: ProfileOverrideDiagnostic["source"],
  envVar: string | null,
  resolvedValue: string | null,
  profileValue: string | null
): void {
  if (source === "default" || source === "profile") {
    return;
  }

  if ((resolvedValue || null) === (profileValue || null)) {
    return;
  }

  overrides.push({
    field,
    source,
    env_var: envVar
  });
}
