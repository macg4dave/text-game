import type { AiConfig, AppConfig, ConfigError } from "../types.js";
import { buildConfigError, DEFAULT_PORT, isSupportedAiProvider, SUPPORTED_AI_PROVIDERS } from "./shared.js";
import { getAiEnvVarNames } from "./env.js";

export function parsePort(value: string | undefined): { value: number; errors: ConfigError[] } {
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

export function validateHttpUrl(
  value: string,
  { path, envVars }: { path: string; envVars: string[] }
): ConfigError[] {
  if (!value) {
    return [];
  }

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

export function validateAiConfig(ai: AiConfig): ConfigError[] {
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

export function formatConfigErrors(errors: ConfigError[] = []): string {
  if (!errors.length) {
    return "Configuration is valid.";
  }

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

export function assertValidConfig(configToValidate: AppConfig): AppConfig {
  const errors = configToValidate.validation.errors || [];
  if (configToValidate.validation.ok) {
    return configToValidate;
  }

  throw new ConfigValidationError(errors);
}
