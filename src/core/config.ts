import process from "node:process";
import type { AppConfig, EnvSource } from "./types.js";
import {
  type AiConfigField,
  type ConfigEnvSource,
  type ConfigLike,
  type ConfigValueSource,
  DEFAULT_PORT,
  SUPPORTED_AI_PROVIDERS,
  type SafeConfigDiagnostics
} from "./config/shared.js";
import {
  getAiEnvVarNames,
  getPublicRuntimeConfig as getPublicRuntimeConfigInternal,
  getSafeConfigDiagnostics as getSafeConfigDiagnosticsInternal,
  loadConfig as loadConfigInternal
} from "./config/env.js";
import {
  buildConfigPreflightIssues as buildConfigPreflightIssuesInternal,
  countPreflightIssues,
  createPreflightReport,
  hasBlockingPreflightIssue
} from "./config/preflight.js";
import {
  assertValidConfig as assertValidConfigInternal,
  ConfigValidationError,
  formatConfigErrors
} from "./config/validation.js";

export {
  DEFAULT_PORT,
  SUPPORTED_AI_PROVIDERS,
  ConfigValidationError,
  formatConfigErrors,
  getAiEnvVarNames,
  countPreflightIssues,
  hasBlockingPreflightIssue,
  createPreflightReport
};

export type { AiConfigField, ConfigEnvSource, ConfigLike, ConfigValueSource, SafeConfigDiagnostics };

export function loadConfig(env: EnvSource = process.env): AppConfig {
  return loadConfigInternal(env);
}

export const config = loadConfig();

export function getSafeConfigDiagnostics(
  configToSummarize: ConfigLike = config,
  env: EnvSource = process.env
): SafeConfigDiagnostics {
  return getSafeConfigDiagnosticsInternal(configToSummarize, env);
}

export function getPublicRuntimeConfig(configToSummarize: ConfigLike, env: EnvSource = process.env) {
  return getPublicRuntimeConfigInternal(configToSummarize, env);
}

export function assertValidConfig(configToValidate: AppConfig = config): AppConfig {
  return assertValidConfigInternal(configToValidate);
}

export function buildConfigPreflightIssues(
  configToSummarize: ConfigLike,
  env: EnvSource = process.env
) {
  return buildConfigPreflightIssuesInternal(configToSummarize, env);
}
