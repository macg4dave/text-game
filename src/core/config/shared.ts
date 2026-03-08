import type {
  AiConfig,
  AppConfig,
  ConfigProfile,
  ConfigError,
  RuntimePreflightIssue,
  RuntimePreflightIssueDetails,
  SupportedAiProfile,
  RuntimePreflightSeverity
} from "../types.js";

export const DEFAULT_PORT = 3000;

export const SUPPORTED_AI_PROVIDERS = ["openai-compatible", "litellm", "ollama"] as const;
export const SUPPORTED_AI_PROFILES = ["local-gpu-small", "local-gpu-large", "custom"] as const;

export type SupportedAiProvider = (typeof SUPPORTED_AI_PROVIDERS)[number];
export type AiConfigField = "apiKey" | "baseUrl" | "chatModel" | "embeddingModel";
export type ProviderDefaults = Omit<AiConfig, "provider">;
export type ConfigLike = Pick<AppConfig, "port" | "profile" | "ai" | "logging" | "validation">;
export type ConfigValueSource = "provider-specific" | "generic" | "legacy" | "profile" | "default";
export type ConfigEnvSource = "env" | "default" | "invalid-env" | "inferred" | "profile";
export type ConfigOverrideField =
  | "ai.provider"
  | "ai.api_key"
  | "ai.base_url"
  | "ai.chat_model"
  | "ai.embedding_model";

export interface ConfigProfileDefinition extends ConfigProfile {
  defaults?: Partial<AiConfig> & { provider?: SupportedAiProvider };
}

export interface ProfileOverrideDiagnostic {
  field: ConfigOverrideField;
  source: ConfigEnvSource | ConfigValueSource;
  env_var: string | null;
}

export interface SafeConfigDiagnostics {
  profile: {
    value: SupportedAiProfile;
    label: string;
    description: string;
    recommended_ai_stack: ConfigProfile["recommendedAiStack"];
    source: "env" | "default" | "invalid-env";
    env_var: string | null;
  };
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
  logging: {
    level: {
      value: string;
      source: ConfigEnvSource;
      env_var: string | null;
    };
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
  profile_overrides: ProfileOverrideDiagnostic[];
}

export const CONFIG_PROFILE_DEFINITIONS: Record<SupportedAiProfile, ConfigProfileDefinition> = {
  "local-gpu-small": {
    id: "local-gpu-small",
    label: "Local GPU small",
    description: "Use the supported LiteLLM Docker path with the conservative 8 GB GPU tier guidance.",
    recommendedAiStack: "local-gpu",
    defaults: {
      provider: "litellm",
      apiKey: "anything",
      baseUrl: "http://127.0.0.1:4000",
      chatModel: "game-chat",
      embeddingModel: "game-embedding"
    }
  },
  "local-gpu-large": {
    id: "local-gpu-large",
    label: "Local GPU large",
    description: "Use the LiteLLM local-GPU path with the documented 12 GB+ matrix guidance.",
    recommendedAiStack: "local-gpu",
    defaults: {
      provider: "litellm",
      apiKey: "anything",
      baseUrl: "http://127.0.0.1:4000",
      chatModel: "game-chat",
      embeddingModel: "game-embedding"
    }
  },
  custom: {
    id: "custom",
    label: "Custom overrides",
    description: "Use the validated advanced env vars directly instead of a starter profile.",
    recommendedAiStack: null
  }
};

export const AI_ENV_VAR_CANDIDATES: Record<
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

export function isSupportedAiProvider(value: string): value is SupportedAiProvider {
  return SUPPORTED_AI_PROVIDERS.includes(value as SupportedAiProvider);
}

export function isSupportedAiProfile(value: string): value is SupportedAiProfile {
  return SUPPORTED_AI_PROFILES.includes(value as SupportedAiProfile);
}

export function readEnv(env: Record<string, string | undefined>, ...keys: Array<string | undefined>): string | undefined {
  for (const key of keys) {
    if (!key) {
      continue;
    }

    const value = env?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function readFirstEnvValue(
  env: Record<string, string | undefined>,
  keys: Array<string | undefined>
): { value: string | undefined; envVar: string | null } {
  for (const key of keys) {
    if (!key) {
      continue;
    }

    const value = env?.[key];
    if (typeof value === "string" && value.trim()) {
      return { value: value.trim(), envVar: key };
    }
  }

  return { value: undefined, envVar: null };
}

export function classifyAiEnvVarSource(
  provider: string,
  field: AiConfigField,
  envVar: string | null
): ConfigValueSource {
  if (!envVar) {
    return "default";
  }

  const providerSpecific = isSupportedAiProvider(provider)
    ? AI_ENV_VAR_CANDIDATES[field].providerSpecific?.[provider]
    : undefined;
  const generic = AI_ENV_VAR_CANDIDATES[field].generic;
  const legacy = AI_ENV_VAR_CANDIDATES[field].legacy;

  if (envVar === legacy) {
    return "legacy";
  }
  if (envVar === generic) {
    return "generic";
  }
  if (envVar === providerSpecific) {
    return "provider-specific";
  }

  return "generic";
}

export function normalizeProvider(value: string | undefined): string {
  if (!value || typeof value !== "string") {
    return "litellm";
  }

  return value.trim().toLowerCase() || "litellm";
}

export function normalizeProfile(value: string | undefined): string {
  if (!value || typeof value !== "string") {
    return "local-gpu-small";
  }

  return value.trim().toLowerCase() || "local-gpu-small";
}

export function normalizeBaseUrl(value: string | undefined): string {
  if (!value || typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function getProviderDefaults(provider: string): ProviderDefaults {
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

export function getConfigProfileDefinition(profile: SupportedAiProfile): ConfigProfileDefinition {
  return CONFIG_PROFILE_DEFINITIONS[profile] || CONFIG_PROFILE_DEFINITIONS["local-gpu-small"];
}

export function buildConfigError({
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

export function buildPreflightIssue({
  code,
  severity,
  area,
  title,
  message,
  recovery,
  envVars = [],
  details
}: {
  code: string;
  severity: RuntimePreflightSeverity;
  area: "config" | "ai" | "host" | "storage";
  title: string;
  message: string;
  recovery: string[];
  envVars?: string[];
  details?: RuntimePreflightIssueDetails;
}): RuntimePreflightIssue {
  return {
    code,
    severity,
    area,
    title,
    message,
    recovery,
    recommended_fix: recovery[0] || null,
    env_vars: envVars,
    details
  };
}
