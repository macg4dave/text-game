function readEnv(...keys) {
  for (const key of keys) {
    if (!key) continue;
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveAiConfig() {
  const provider = readEnv("AI_PROVIDER") || "openai-compatible";
  const isLiteLlm = provider === "litellm";

  return {
    provider,
    apiKey:
      readEnv(
        isLiteLlm ? "LITELLM_API_KEY" : undefined,
        "AI_API_KEY",
        "OPENAI_API_KEY"
      ) || (isLiteLlm ? "anything" : ""),
    baseUrl: normalizeBaseUrl(
      readEnv(
        isLiteLlm ? "LITELLM_PROXY_URL" : undefined,
        "AI_BASE_URL",
        "OPENAI_BASE_URL"
      ) || (isLiteLlm ? "http://127.0.0.1:4000" : "")
    ),
    chatModel:
      readEnv(
        isLiteLlm ? "LITELLM_CHAT_MODEL" : undefined,
        "AI_CHAT_MODEL",
        "OPENAI_MODEL"
      ) || (isLiteLlm ? "game-chat" : "gpt-4o-mini"),
    embeddingModel:
      readEnv(
        isLiteLlm ? "LITELLM_EMBEDDING_MODEL" : undefined,
        "AI_EMBEDDING_MODEL",
        "OPENAI_EMBEDDING_MODEL"
      ) || (isLiteLlm ? "game-embedding" : "text-embedding-3-small")
  };
}

export const config = {
  port: Number.parseInt(process.env.PORT || "3000", 10),
  ai: resolveAiConfig()
};
