param(
  [switch]$NoBrowser,
  [switch]$SkipInstall,
  [switch]$ForceInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeModulesPath = Join-Path $repoRoot "node_modules"
$dotEnvPath = Join-Path $repoRoot ".env"
$litellmConfigPath = Join-Path $repoRoot "litellm.config.yaml"

Set-Location -LiteralPath $repoRoot

function Write-Step {
  param([string]$Message)

  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Message)

  Write-Host "    $Message" -ForegroundColor DarkGray
}

function Fail {
  param([string]$Message)

  throw $Message
}

function Get-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    return $null
  }

  return $command.Source
}

function Load-DotEnvMap {
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

function Get-PortValue {
  param([string]$Value)

  $parsed = 0
  if ([int]::TryParse($Value, [ref]$parsed) -and $parsed -gt 0 -and $parsed -lt 65536) {
    return $parsed
  }

  return 3000
}

function Resolve-LocalHealthUrl {
  param([string]$BaseUrl)

  if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    return $null
  }

  $uri = [System.Uri]$BaseUrl
  if ($uri.Host -notin @("127.0.0.1", "localhost")) {
    return $null
  }

  $baseRoot = $BaseUrl.TrimEnd("/")
  if ($baseRoot.EndsWith("/v1")) {
    $baseRoot = $baseRoot.Substring(0, $baseRoot.Length - 3)
  }

  return "$baseRoot/api/version"
}

function Test-HttpReady {
  param(
    [string]$Uri,
    [int]$TimeoutSeconds = 3
  )

  try {
    $null = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec $TimeoutSeconds -UseBasicParsing
    return $true
  } catch {
    return $false
  }
}

function Wait-ForHttpReady {
  param(
    [string]$Uri,
    [int]$TimeoutSeconds = 45,
    [int]$PollMilliseconds = 1000
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady -Uri $Uri) {
      return $true
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return $false
}

function Test-TcpOpen {
  param(
    [string]$ComputerName,
    [int]$Port,
    [int]$TimeoutMilliseconds = 1500
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($ComputerName, $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)
    if (-not $connected) {
      return $false
    }

    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-ForTcpOpen {
  param(
    [string]$ComputerName,
    [int]$Port,
    [int]$TimeoutSeconds = 25,
    [int]$PollMilliseconds = 1000
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpOpen -ComputerName $ComputerName -Port $Port) {
      return $true
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return $false
}

function Get-LocalUri {
  param([string]$UriText)

  if ([string]::IsNullOrWhiteSpace($UriText)) {
    return $null
  }

  $uri = [System.Uri]$UriText
  if ($uri.Host -notin @("127.0.0.1", "localhost")) {
    return $null
  }

  return $uri
}

function Get-StartupConfig {
  param([hashtable]$DotEnv)

  $hasDotEnv = Test-Path -LiteralPath $dotEnvPath
  $fallbackProvider = if ($hasDotEnv) { "openai-compatible" } else { "ollama" }
  $provider = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_PROVIDER") -Default $fallbackProvider
  $provider = $provider.Trim().ToLowerInvariant()

  $port = Get-PortValue (Get-ConfigValue -DotEnv $DotEnv -Keys @("PORT") -Default "3000")
  $appUrl = "http://127.0.0.1:$port/"

  $defaults = switch ($provider) {
    "litellm" {
      @{
        baseUrl = "http://127.0.0.1:4000"
        apiKey = "anything"
        chatModel = "game-chat"
        embeddingModel = "game-embedding"
      }
    }
    "ollama" {
      @{
        baseUrl = "http://127.0.0.1:11434/v1"
        apiKey = "ollama"
        chatModel = "gemma3:4b"
        embeddingModel = "embeddinggemma"
      }
    }
    default {
      @{
        baseUrl = ""
        apiKey = ""
        chatModel = "gpt-4o-mini"
        embeddingModel = "text-embedding-3-small"
      }
    }
  }

  $baseUrl = switch ($provider) {
    "litellm" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_PROXY_URL", "AI_BASE_URL", "OPENAI_BASE_URL") -Default $defaults.baseUrl
    }
    "ollama" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_BASE_URL", "AI_BASE_URL", "OPENAI_BASE_URL") -Default $defaults.baseUrl
    }
    default {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_BASE_URL", "OPENAI_BASE_URL") -Default $defaults.baseUrl
    }
  }

  $apiKey = switch ($provider) {
    "litellm" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_API_KEY", "AI_API_KEY", "OPENAI_API_KEY") -Default $defaults.apiKey
    }
    "ollama" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_API_KEY", "AI_API_KEY", "OPENAI_API_KEY") -Default $defaults.apiKey
    }
    default {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_API_KEY", "OPENAI_API_KEY") -Default $defaults.apiKey
    }
  }

  $chatModel = switch ($provider) {
    "litellm" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_CHAT_MODEL", "AI_CHAT_MODEL", "OPENAI_MODEL") -Default $defaults.chatModel
    }
    "ollama" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_CHAT_MODEL", "AI_CHAT_MODEL", "OPENAI_MODEL") -Default $defaults.chatModel
    }
    default {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_CHAT_MODEL", "OPENAI_MODEL") -Default $defaults.chatModel
    }
  }

  $embeddingModel = switch ($provider) {
    "litellm" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_EMBEDDING_MODEL", "AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") -Default $defaults.embeddingModel
    }
    "ollama" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_EMBEDDING_MODEL", "AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") -Default $defaults.embeddingModel
    }
    default {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") -Default $defaults.embeddingModel
    }
  }

  $launchOverrides = @{}
  if (-not $hasDotEnv) {
    $launchOverrides["AI_PROVIDER"] = $provider
    $launchOverrides["PORT"] = [string]$port
    if ($provider -eq "ollama") {
      $launchOverrides["OLLAMA_BASE_URL"] = $baseUrl
      $launchOverrides["OLLAMA_API_KEY"] = $apiKey
      $launchOverrides["OLLAMA_CHAT_MODEL"] = $chatModel
      $launchOverrides["OLLAMA_EMBEDDING_MODEL"] = $embeddingModel
    } elseif ($provider -eq "litellm") {
      $launchOverrides["LITELLM_PROXY_URL"] = $baseUrl
      $launchOverrides["LITELLM_API_KEY"] = $apiKey
      $launchOverrides["LITELLM_CHAT_MODEL"] = $chatModel
      $launchOverrides["LITELLM_EMBEDDING_MODEL"] = $embeddingModel
    } else {
      if ($baseUrl) {
        $launchOverrides["AI_BASE_URL"] = $baseUrl
      }
      if ($apiKey) {
        $launchOverrides["AI_API_KEY"] = $apiKey
      }
      $launchOverrides["AI_CHAT_MODEL"] = $chatModel
      $launchOverrides["AI_EMBEDDING_MODEL"] = $embeddingModel
    }
  }

  return [ordered]@{
    hasDotEnv = $hasDotEnv
    provider = $provider
    port = $port
    appUrl = $appUrl
    baseUrl = $baseUrl.TrimEnd("/")
    healthUrl = if ($provider -eq "ollama") { Resolve-LocalHealthUrl -BaseUrl $baseUrl } else { $null }
    apiKey = $apiKey
    chatModel = $chatModel
    embeddingModel = $embeddingModel
    launchOverrides = $launchOverrides
  }
}

function Ensure-NodeTooling {
  $nodePath = Get-CommandPath -Name "node"
  $npmPath = Get-CommandPath -Name "npm"

  if (-not $nodePath) {
    Fail "Node.js was not found on PATH. Install Node.js for Windows, then rerun this script."
  }

  if (-not $npmPath) {
    Fail "npm was not found on PATH. Install Node.js for Windows, then rerun this script."
  }

  Write-Info ("node: {0}" -f $nodePath)
  Write-Info ("npm: {0}" -f $npmPath)
}

function Ensure-Dependencies {
  if ($SkipInstall) {
    Write-Info "Skipping npm install because -SkipInstall was provided."
    return
  }

  $needsInstall = $ForceInstall -or -not (Test-Path -LiteralPath $nodeModulesPath)
  if (-not $needsInstall) {
    Write-Info "Using existing node_modules."
    return
  }

  Write-Step "Installing npm dependencies"
  & npm install
}

function Ensure-OllamaReady {
  param($Config)

  $ollamaPath = Get-CommandPath -Name "ollama"
  if (-not $ollamaPath) {
    Fail "AI_PROVIDER=ollama but the Ollama CLI was not found on PATH."
  }

  if (-not $Config.healthUrl) {
    Fail "AI_PROVIDER=ollama expects a local OLLAMA_BASE_URL."
  }

  Write-Info ("ollama: {0}" -f $ollamaPath)
  Write-Info ("base URL: {0}" -f $Config.baseUrl)

  if (-not (Test-HttpReady -Uri $Config.healthUrl)) {
    Write-Step "Starting Ollama background server"
    Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden | Out-Null
  }

  if (-not (Wait-ForHttpReady -Uri $Config.healthUrl -TimeoutSeconds 25)) {
    Fail ("Ollama did not become ready at {0}." -f $Config.healthUrl)
  }

  Write-Info "Ollama API is reachable."

  $tags = Invoke-RestMethod -Uri ($Config.healthUrl -replace "/api/version$", "/api/tags") -Method Get
  $availableModels = @($tags.models | ForEach-Object { $_.name })

  if ($availableModels -notcontains $Config.chatModel) {
    Fail ("Missing Ollama chat model '{0}'. Run: ollama pull {0}" -f $Config.chatModel)
  }

  if ($availableModels -notcontains $Config.embeddingModel) {
    Fail ("Missing Ollama embedding model '{0}'. Run: ollama pull {0}" -f $Config.embeddingModel)
  }

  Write-Info ("Ollama models ready: {0}, {1}" -f $Config.chatModel, $Config.embeddingModel)
}

function Ensure-LiteLlmReady {
  param($Config)

  $uri = [System.Uri]$Config.baseUrl
  if (Test-TcpOpen -ComputerName $uri.Host -Port $uri.Port) {
    Write-Info ("LiteLLM proxy reachable at {0}" -f $Config.baseUrl)
    return
  }

  $liteLlmPath = Get-CommandPath -Name "litellm"
  if (-not $liteLlmPath) {
    Fail ("AI_PROVIDER=litellm but LiteLLM is not reachable at {0} and the litellm CLI was not found on PATH." -f $Config.baseUrl)
  }

  if (-not (Test-Path -LiteralPath $litellmConfigPath)) {
    Fail ("AI_PROVIDER=litellm but {0} is missing." -f $litellmConfigPath)
  }

  Write-Step "Starting LiteLLM proxy"
  Start-Process -FilePath $liteLlmPath -ArgumentList @("--config", $litellmConfigPath, "--port", [string]$uri.Port) -WindowStyle Hidden | Out-Null

  if (-not (Wait-ForTcpOpen -ComputerName $uri.Host -Port $uri.Port -TimeoutSeconds 25)) {
    Fail ("LiteLLM did not become ready at {0}." -f $Config.baseUrl)
  }

  Write-Info ("LiteLLM proxy reachable at {0}" -f $Config.baseUrl)
}

function Ensure-ProviderReady {
  param($Config)

  Write-Step ("Checking AI provider: {0}" -f $Config.provider)
  Write-Info ("chat model: {0}" -f $Config.chatModel)
  Write-Info ("embedding model: {0}" -f $Config.embeddingModel)

  switch ($Config.provider) {
    "ollama" {
      Ensure-OllamaReady -Config $Config
      return
    }
    "litellm" {
      Ensure-LiteLlmReady -Config $Config
      return
    }
    default {
      if ([string]::IsNullOrWhiteSpace($Config.baseUrl) -and [string]::IsNullOrWhiteSpace($Config.apiKey)) {
        Fail "No AI credentials were found. Set AI_API_KEY or create a .env file before starting the app."
      }

      $localUri = Get-LocalUri -UriText $Config.baseUrl
      if ($localUri -and -not (Wait-ForTcpOpen -ComputerName $localUri.Host -Port $localUri.Port -TimeoutSeconds 10)) {
        Fail ("Configured local AI endpoint did not respond at {0}." -f $Config.baseUrl)
      }

      Write-Info "Using configured OpenAI-compatible provider."
    }
  }
}

function Start-AppServer {
  param($Config)

  if (Test-HttpReady -Uri $Config.appUrl) {
    Write-Info ("App server already responding at {0}" -f $Config.appUrl)
    return
  }

  Write-Step "Starting app server in a new PowerShell window"

  $commandLines = New-Object System.Collections.Generic.List[string]
  $commandLines.Add(("Set-Location -LiteralPath '{0}'" -f $repoRoot.Replace("'", "''")))
  foreach ($entry in $Config.launchOverrides.GetEnumerator()) {
    $escapedValue = $entry.Value.Replace("'", "''")
    $commandLines.Add(('$env:{0} = ''{1}''' -f $entry.Key, $escapedValue))
  }
  $commandLines.Add("npm run dev")
  $commandText = [string]::Join("; ", $commandLines)

  $bytes = [System.Text.Encoding]::Unicode.GetBytes($commandText)
  $encodedCommand = [Convert]::ToBase64String($bytes)

  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    $encodedCommand
  ) -WorkingDirectory $repoRoot | Out-Null

  if (-not (Wait-ForHttpReady -Uri $Config.appUrl -TimeoutSeconds 45)) {
    Fail ("App server did not become ready at {0}. Check the new PowerShell window for errors." -f $Config.appUrl)
  }

  Write-Info ("App server is ready at {0}" -f $Config.appUrl)
}

$dotEnv = Load-DotEnvMap -Path $dotEnvPath
$config = Get-StartupConfig -DotEnv $dotEnv

Write-Host "Text Game Windows startup" -ForegroundColor Green
Write-Info ("repo: {0}" -f $repoRoot)
if ($config.hasDotEnv) {
  Write-Info "configuration: using .env"
} else {
  Write-Info "configuration: no .env found, launcher will use local defaults for this run"
}

Ensure-NodeTooling
Ensure-Dependencies
Ensure-ProviderReady -Config $config
Start-AppServer -Config $config

if (-not $NoBrowser) {
  Write-Step "Opening browser"
  Start-Process $config.appUrl
} else {
  Write-Info "Skipping browser open because -NoBrowser was provided."
}

Write-Host ""
Write-Host ("Ready: {0}" -f $config.appUrl) -ForegroundColor Green
