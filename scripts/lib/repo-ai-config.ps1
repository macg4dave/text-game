function Resolve-RepoAiConfig {
  param(
    [hashtable]$DotEnv,
    [bool]$HasDotEnv = $false,
    [switch]$IncludePort
  )

  $profileId = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_PROFILE") -Default "local-gpu-small"
  if ([string]::IsNullOrWhiteSpace($profileId)) {
    $profileId = "local-gpu-small"
  }
  $profileId = $profileId.Trim().ToLowerInvariant()

  if ($profileId -notin @("local-gpu-small", "local-gpu-large", "custom")) {
    $profileId = "local-gpu-small"
  }

  $provider = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_PROVIDER") -Default ""
  if (-not (Test-AnyConfigValuePresent -DotEnv $DotEnv -Keys @("AI_PROVIDER")) -and $profileId -ne "custom") {
    $provider = "litellm"
  }
  if ([string]::IsNullOrWhiteSpace($provider)) {
    if (Test-AnyConfigValuePresent -DotEnv $DotEnv -Keys @("LITELLM_PROXY_URL", "LITELLM_API_KEY", "LITELLM_CHAT_MODEL", "LITELLM_EMBEDDING_MODEL")) {
      $provider = "litellm"
    } elseif (Test-AnyConfigValuePresent -DotEnv $DotEnv -Keys @("OLLAMA_BASE_URL", "OLLAMA_API_KEY", "OLLAMA_CHAT_MODEL", "OLLAMA_EMBEDDING_MODEL")) {
      $provider = "ollama"
    } elseif (Test-AnyConfigValuePresent -DotEnv $DotEnv -Keys @("AI_API_KEY", "AI_BASE_URL", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_EMBEDDING_MODEL")) {
      $provider = "openai-compatible"
    } else {
      $provider = "litellm"
    }
  }

  $provider = $provider.Trim().ToLowerInvariant()

  switch ($provider) {
    "litellm" {
      $baseUrl = Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_PROXY_URL", "AI_BASE_URL", "OPENAI_BASE_URL") -Default "http://127.0.0.1:4000"
      $apiKey = Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_API_KEY", "AI_API_KEY", "OPENAI_API_KEY") -Default "anything"
      $chatModel = Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_CHAT_MODEL", "AI_CHAT_MODEL", "OPENAI_MODEL") -Default "game-chat"
      $embeddingModel = Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_EMBEDDING_MODEL", "AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") -Default "game-embedding"
      break
    }
    "ollama" {
      $baseUrl = Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_BASE_URL", "AI_BASE_URL", "OPENAI_BASE_URL") -Default "http://127.0.0.1:11434/v1"
      $apiKey = Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_API_KEY", "AI_API_KEY", "OPENAI_API_KEY") -Default "ollama"
      $chatModel = Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_CHAT_MODEL", "AI_CHAT_MODEL", "OPENAI_MODEL") -Default "gemma3:4b"
      $embeddingModel = Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_EMBEDDING_MODEL", "AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") -Default "embeddinggemma"
      break
    }
    default {
      $baseUrl = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_BASE_URL", "OPENAI_BASE_URL") -Default ""
      $apiKey = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_API_KEY", "OPENAI_API_KEY") -Default ""
      $chatModel = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_CHAT_MODEL", "OPENAI_MODEL") -Default "gpt-4o-mini"
      $embeddingModel = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") -Default "text-embedding-3-small"
      break
    }
  }

  $config = [ordered]@{
    hasDotEnv = $HasDotEnv
    profile = $profileId
    provider = $provider
    baseUrl = $baseUrl.TrimEnd("/")
    apiKey = $apiKey
    chatModel = $chatModel
    embeddingModel = $embeddingModel
  }

  if ($IncludePort) {
    $config.port = Get-PortValue (Get-ConfigValue -DotEnv $DotEnv -Keys @("PORT") -Default "3000")
  }

  return $config
}
