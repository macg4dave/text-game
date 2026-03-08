Set-StrictMode -Version Latest

function Get-DotEnvMap {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not [string]::IsNullOrWhiteSpace($key)) {
      $values[$key] = $value
    }
  }

  return $values
}

function Import-DotEnvIntoSession {
  param([string]$Path)

  $values = Get-DotEnvMap -Path $Path
  foreach ($entry in $values.GetEnumerator()) {
    if (-not (Test-Path ("Env:{0}" -f $entry.Key))) {
      Set-Item -Path ("Env:{0}" -f $entry.Key) -Value $entry.Value
    }
  }

  return $values
}

function Get-ConfigValue {
  param(
    [hashtable]$DotEnv,
    [string[]]$Keys,
    [string]$Default = ""
  )

  foreach ($key in $Keys) {
    if ([string]::IsNullOrWhiteSpace($key)) {
      continue
    }

    $sessionValue = [Environment]::GetEnvironmentVariable($key)
    if (-not [string]::IsNullOrWhiteSpace($sessionValue)) {
      return $sessionValue.Trim()
    }

    if ($DotEnv.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($DotEnv[$key])) {
      return $DotEnv[$key].Trim()
    }
  }

  return $Default
}

function Test-AnyConfigValuePresent {
  param(
    [hashtable]$DotEnv,
    [string[]]$Keys
  )

  foreach ($key in $Keys) {
    if ([string]::IsNullOrWhiteSpace($key)) {
      continue
    }

    $value = [Environment]::GetEnvironmentVariable($key)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $true
    }

    if ($DotEnv.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($DotEnv[$key])) {
      return $true
    }
  }

  return $false
}

function Get-PortValue {
  param([string]$Value)

  $parsed = 0
  if ([int]::TryParse($Value, [ref]$parsed) -and $parsed -gt 0 -and $parsed -lt 65536) {
    return $parsed
  }

  return 3000
}

function Get-UriObject {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  try {
    return [System.Uri]$Text
  } catch {
    return $null
  }
}

function Test-HttpReady {
  param(
    [string]$Uri,
    [int]$TimeoutSeconds = 3,
    [string]$ExpectedContent = ""
  )

  try {
    $response = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec $TimeoutSeconds -UseBasicParsing
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
      return $false
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpectedContent) -and ($response.Content -notlike "*$ExpectedContent*")) {
      return $false
    }

    return $true
  } catch {
    return $false
  }
}

function Wait-ForHttpReady {
  param(
    [string]$Uri,
    [int]$TimeoutSeconds = 60,
    [int]$PollMilliseconds = 1000,
    [string]$ExpectedContent = ""
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady -Uri $Uri -TimeoutSeconds $TimeoutSeconds -ExpectedContent $ExpectedContent) {
      return $true
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return $false
}

function Resolve-RepoAiConfig {
  param(
    [hashtable]$DotEnv,
    [bool]$HasDotEnv = $false,
    [switch]$IncludePort
  )

  $provider = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_PROVIDER") -Default ""
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
