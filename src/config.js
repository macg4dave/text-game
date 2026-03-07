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

function normalizeProvider(value) {
  if (!value || typeof value !== "string") return "openai-compatible";
  return value.trim().toLowerCase() || "openai-compatible";
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getProviderDefaults(provider) {
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

function resolveAiConfig() {
  const provider = normalizeProvider(readEnv("AI_PROVIDER"));
  const defaults = getProviderDefaults(provider);

  return {
    provider,
    apiKey:
      readEnv(
        provider === "litellm" ? "LITELLM_API_KEY" : undefined,
        provider === "ollama" ? "OLLAMA_API_KEY" : undefined,
        "AI_API_KEY",
        "OPENAI_API_KEY"
      ) || defaults.apiKey,
    baseUrl: normalizeBaseUrl(
      readEnv(
        provider === "litellm" ? "LITELLM_PROXY_URL" : undefined,
        provider === "ollama" ? "OLLAMA_BASE_URL" : undefined,
        "AI_BASE_URL",
        "OPENAI_BASE_URL"
      ) || defaults.baseUrl
    ),
    chatModel:
      readEnv(
        provider === "litellm" ? "LITELLM_CHAT_MODEL" : undefined,
        provider === "ollama" ? "OLLAMA_CHAT_MODEL" : undefined,
        "AI_CHAT_MODEL",
        "OPENAI_MODEL"
      ) || defaults.chatModel,
    embeddingModel:
      readEnv(
        provider === "litellm" ? "LITELLM_EMBEDDING_MODEL" : undefined,
        provider === "ollama" ? "OLLAMA_EMBEDDING_MODEL" : undefined,
        "AI_EMBEDDING_MODEL",
        "OPENAI_EMBEDDING_MODEL"
      ) || defaults.embeddingModel
  };
}

export const config = {
  port: Number.parseInt(process.env.PORT || "3000", 10),
  ai: resolveAiConfig()
};
