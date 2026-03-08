import type { AppConfig, RuntimePreflightReport, SetupStatusPayload } from "../core/types.js";

const SUPPORTED_MVP_PATH = {
  provider: "LiteLLM",
  title: "Supported MVP AI path",
  summary: "Use the Windows launcher with Docker Desktop so the app, LiteLLM, and the GPU-backed Ollama route start together.",
  launcher: "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1",
  services: ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"]
} as const;

export function createSetupStatusPayload(config: AppConfig, preflight: RuntimePreflightReport): SetupStatusPayload {
  return {
    setup: {
      status: preflight.status,
      summary: preflight.summary,
      checked_at: preflight.checked_at,
      can_retry: true,
      current_profile: {
        id: config.profile.id,
        label: config.profile.label,
        provider: config.ai.provider,
        chat_model: config.ai.chatModel,
        embedding_model: config.ai.embeddingModel
      },
      supported_path: {
        provider: SUPPORTED_MVP_PATH.provider,
        title: SUPPORTED_MVP_PATH.title,
        summary: SUPPORTED_MVP_PATH.summary,
        launcher: SUPPORTED_MVP_PATH.launcher,
        services: [...SUPPORTED_MVP_PATH.services]
      },
      preflight
    }
  };
}

