param(
  [switch]$NoBrowser,
  [switch]$Rebuild,
  [switch]$Detached = $true
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$dotEnvPath = Join-Path $repoRoot ".env"

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

function Invoke-Native {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail ("Command failed: {0} {1}" -f $FilePath, ($Arguments -join " "))
  }
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
    [int]$TimeoutSeconds = 60,
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

function Resolve-ProviderConfig {
  param([hashtable]$DotEnv)

  $hasDotEnv = Test-Path -LiteralPath $dotEnvPath
  $provider = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_PROVIDER") -Default ($(if ($hasDotEnv) { "openai-compatible" } else { "ollama" }))
  $provider = $provider.Trim().ToLowerInvariant()
  $port = Get-PortValue (Get-ConfigValue -DotEnv $DotEnv -Keys @("PORT") -Default "3000")

  $baseUrl = switch ($provider) {
    "litellm" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_PROXY_URL", "AI_BASE_URL") -Default "http://127.0.0.1:4000"
    }
    "ollama" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_BASE_URL", "AI_BASE_URL") -Default "http://127.0.0.1:11434/v1"
    }
    default {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_BASE_URL") -Default ""
    }
  }

  return [ordered]@{
    hasDotEnv = $hasDotEnv
    provider = $provider
    baseUrl = $baseUrl
    port = $port
    appUrl = "http://127.0.0.1:$port/"
  }
}

function Convert-ToDockerReachableUrl {
  param([string]$Url)

  $uri = Get-UriObject -Text $Url
  if ($null -eq $uri) {
    return $Url
  }

  if ($uri.Host -notin @("127.0.0.1", "localhost")) {
    return $Url
  }

  return $Url.Replace($uri.Host, "host.docker.internal")
}

function Ensure-DockerTooling {
  $dockerPath = Get-CommandPath -Name "docker"
  if (-not $dockerPath) {
    Fail "Docker was not found on PATH. Install Docker Desktop or Docker Engine with Compose support, then rerun this script."
  }

  Write-Info ("docker: {0}" -f $dockerPath)

  Invoke-Native -FilePath "docker" -Arguments @("info")
  Invoke-Native -FilePath "docker" -Arguments @("compose", "version")
}

function Ensure-ProviderReady {
  param($Config)

  Write-Step ("Checking AI provider: {0}" -f $Config.provider)
  if ([string]::IsNullOrWhiteSpace($Config.baseUrl)) {
    Write-Info "No local AI base URL to probe from the host."
    return
  }

  $uri = Get-UriObject -Text $Config.baseUrl
  if ($null -eq $uri) {
    Write-Info ("Skipping AI reachability check because base URL is not a valid URI: {0}" -f $Config.baseUrl)
    return
  }

  if ($uri.Host -notin @("127.0.0.1", "localhost")) {
    Write-Info ("Using remote/non-local AI endpoint: {0}" -f $Config.baseUrl)
    return
  }

  $probeUrl = switch ($Config.provider) {
    "ollama" { "http://127.0.0.1:11434/api/version" }
    default { "{0}://{1}:{2}/" -f $uri.Scheme, $uri.Host, $uri.Port }
  }

  if (-not (Wait-ForHttpReady -Uri $probeUrl -TimeoutSeconds 10)) {
    if ($Config.provider -eq "ollama") {
      $ollamaPath = Get-CommandPath -Name "ollama"
      if ($ollamaPath) {
        Write-Step "Starting Ollama background server"
        Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden | Out-Null
        if (Wait-ForHttpReady -Uri $probeUrl -TimeoutSeconds 20) {
          Write-Info "Ollama API is reachable."
          return
        }
      }
    }

    Fail ("Configured local AI endpoint did not respond at {0}." -f $probeUrl)
  }

  Write-Info ("AI endpoint is reachable: {0}" -f $probeUrl)
}

function Set-ComposeOverrides {
  param($Config)

  if ($Config.provider -eq "ollama") {
    $translated = Convert-ToDockerReachableUrl -Url $(if ($Config.baseUrl) { $Config.baseUrl } else { "http://127.0.0.1:11434/v1" })
    if ($translated -ne $Config.baseUrl) {
      Write-Info ("Container AI URL override: {0}" -f $translated)
    }
    $env:OLLAMA_BASE_URL = $translated
    return
  }

  if ($Config.provider -eq "litellm") {
    $translated = Convert-ToDockerReachableUrl -Url $(if ($Config.baseUrl) { $Config.baseUrl } else { "http://127.0.0.1:4000" })
    if ($translated -ne $Config.baseUrl) {
      Write-Info ("Container LiteLLM URL override: {0}" -f $translated)
    }
    $env:LITELLM_PROXY_URL = $translated
    return
  }

  if (-not [string]::IsNullOrWhiteSpace($Config.baseUrl)) {
    $translated = Convert-ToDockerReachableUrl -Url $Config.baseUrl
    if ($translated -ne $Config.baseUrl) {
      Write-Info ("Container AI URL override: {0}" -f $translated)
    }
    $env:AI_BASE_URL = $translated
  }
}

function Start-AppContainer {
  param($Config)

  $args = @("compose", "up")
  if ($Rebuild) {
    $args += "--build"
  }
  if ($Detached) {
    $args += "-d"
  }
  $args += "app"

  Write-Step "Starting app container"
  Invoke-Native -FilePath "docker" -Arguments $args

  if (-not (Wait-ForHttpReady -Uri $Config.appUrl -TimeoutSeconds 90)) {
    Write-Host ""
    & docker compose ps
    Write-Host ""
    & docker compose logs --tail 100 app
    Fail ("App did not become ready at {0}." -f $Config.appUrl)
  }

  Write-Info ("App server is ready at {0}" -f $Config.appUrl)
}

$dotEnv = Load-DotEnvMap -Path $dotEnvPath
$config = Resolve-ProviderConfig -DotEnv $dotEnv

Write-Host "Text Game Docker startup" -ForegroundColor Green
Write-Info ("repo: {0}" -f $repoRoot)
Write-Info ("provider: {0}" -f $config.provider)
if ($config.hasDotEnv) {
  Write-Info "configuration: using .env"
} else {
  Write-Info "configuration: no .env found, using Docker-side local defaults for this run"
}

Ensure-DockerTooling
Ensure-ProviderReady -Config $config
Set-ComposeOverrides -Config $config
Start-AppContainer -Config $config

if (-not $NoBrowser) {
  Write-Step "Opening browser"
  Start-Process $config.appUrl
} else {
  Write-Info "Skipping browser open because -NoBrowser was provided."
}

Write-Host ""
Write-Host ("Ready: {0}" -f $config.appUrl) -ForegroundColor Green
