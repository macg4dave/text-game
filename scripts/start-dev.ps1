param(
  [switch]$NoBrowser,
  [switch]$Rebuild,
  [ValidateSet("hosted", "local-gpu")]
  [string]$AiStack = "hosted"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$dotEnvPath = Join-Path $repoRoot ".env"
$composeFileArgs = @("-f", (Join-Path $repoRoot "docker-compose.yml"))
if ($AiStack -eq "local-gpu") {
  $composeFileArgs += @("-f", (Join-Path $repoRoot "docker-compose.gpu.yml"))
}

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
    [string[]]$ArgList
  )

  & $FilePath @ArgList
  if ($LASTEXITCODE -ne 0) {
    Fail ("Command failed: {0} {1}" -f $FilePath, ($ArgList -join " "))
  }
}

function Invoke-NativeCapture {
  param(
    [string]$FilePath,
    [string[]]$ArgList
  )

  $restorePreference = $null
  $hadPreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
  if ($hadPreference) {
    $restorePreference = $PSNativeCommandUseErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $false
  }

  try {
    $output = & $FilePath @ArgList 2>&1
    return [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Output = @($output)
    }
  } finally {
    if ($hadPreference) {
      $PSNativeCommandUseErrorActionPreference = $restorePreference
    }
  }
}

function Invoke-DockerCompose {
  param([string[]]$ArgList)

  Invoke-Native -FilePath "docker" -ArgList (@("compose") + $composeFileArgs + $ArgList)
}

function Invoke-DockerComposeCapture {
  param([string[]]$ArgList)

  return Invoke-NativeCapture -FilePath "docker" -ArgList (@("compose") + $composeFileArgs + $ArgList)
}

function Show-DockerComposeStatus {
  & docker @(@("compose") + $composeFileArgs + @("ps"))
}

function Show-DockerComposeLogs {
  param([string[]]$Services)

  & docker @(@("compose") + $composeFileArgs + @("logs", "--tail", "100") + $Services)
}

function Get-DebugLogServices {
  $services = @("app", "litellm")
  if ($AiStack -eq "local-gpu") {
    $services += "ollama"
  }

  return $services
}

function Get-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    return $null
  }

  return $command.Source
}

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
    if (Test-HttpReady -Uri $Uri -ExpectedContent $ExpectedContent) {
      return $true
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return $false
}

function Get-ListeningProcessName {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $connection) {
    return $null
  }

  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    return ("PID {0}" -f $connection.OwningProcess)
  }

  return $process.ProcessName
}

function Get-AlternatePortSuggestion {
  param([int]$CurrentPort)

  $candidate = $CurrentPort + 100
  if ($candidate -gt 0 -and $candidate -lt 65536) {
    return $candidate
  }

  return 3000
}

function Wait-ForPortReleased {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 15,
    [int]$PollMilliseconds = 500
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($null -eq (Get-ListeningProcessName -Port $Port)) {
      return $true
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return $false
}

function Set-ConfigPort {
  param(
    $Config,
    [int]$Port
  )

  $Config.port = $Port
  $Config.appUrl = "http://127.0.0.1:$Port/"
  $Config.readyUrl = "http://127.0.0.1:$Port/api/state?name=LauncherCheck"
}

function Find-AvailablePort {
  param(
    [int]$PreferredPort,
    [int]$MaxAttempts = 20
  )

  $candidates = New-Object System.Collections.Generic.List[int]
  $baseSuggestion = Get-AlternatePortSuggestion -CurrentPort $PreferredPort
  $null = $candidates.Add($baseSuggestion)

  for ($offset = 1; $offset -lt $MaxAttempts; $offset++) {
    $candidate = $baseSuggestion + $offset
    if ($candidate -gt 0 -and $candidate -lt 65536) {
      $null = $candidates.Add($candidate)
    }
  }

  foreach ($candidate in $candidates) {
    if ($null -eq (Get-ListeningProcessName -Port $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Resolve-LaunchPort {
  param($Config)

  $portProcess = Get-ListeningProcessName -Port $Config.port
  if ($null -eq $portProcess) {
    return
  }

  if (Test-HttpReady -Uri $Config.readyUrl -TimeoutSeconds 2 -ExpectedContent '"player"') {
    return
  }

  $alternatePort = Find-AvailablePort -PreferredPort $Config.port
  if ($null -ne $alternatePort) {
    Write-Info ("Port {0} is in use by `{1}`. Using port {2} for this launcher run." -f $Config.port, $portProcess, $alternatePort)
    Set-ConfigPort -Config $Config -Port $alternatePort
    $env:PORT = [string]$alternatePort
    return
  }

  $guidance = @(
    ("Port {0} is already in use by another local service (`{1}`)." -f $Config.port, $portProcess),
    "Stop that service, or set `PORT` in `.env` or this PowerShell session to an unused port, then rerun the launcher."
  )

  Fail ($guidance -join [Environment]::NewLine)
}

function Get-AppContainerId {
  $result = Invoke-DockerComposeCapture -ArgList @("ps", "-q", "app")
  if ($result.ExitCode -ne 0) {
    Fail "Unable to determine the app container id from docker compose."
  }

  return (($result.Output -join "`n") | Out-String).Trim()
}

function Get-ContainerHealthStatus {
  param([string]$ContainerId)

  if ([string]::IsNullOrWhiteSpace($ContainerId)) {
    return "missing"
  }

  $status = & docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $ContainerId
  if ($LASTEXITCODE -ne 0) {
    return "missing"
  }

  return ($status | Out-String).Trim()
}

function Wait-ForContainerHealthy {
  param(
    [string]$ContainerId,
    [int]$TimeoutSeconds = 90,
    [int]$PollMilliseconds = 1000
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $status = Get-ContainerHealthStatus -ContainerId $ContainerId
    switch ($status) {
      "healthy" { return $true }
      "unhealthy" { return $false }
      "exited" { return $false }
      "dead" { return $false }
      default { }
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return $false
}

function Resolve-ProviderConfig {
  param([hashtable]$DotEnv)

  $hasDotEnv = Test-Path -LiteralPath $dotEnvPath
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
  if ($AiStack -in @("hosted", "local-gpu")) {
    $provider = "litellm"
  }
  $port = Get-PortValue (Get-ConfigValue -DotEnv $DotEnv -Keys @("PORT") -Default "3000")

  $baseUrl = switch ($provider) {
    "litellm" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("LITELLM_PROXY_URL", "AI_BASE_URL", "OPENAI_BASE_URL") -Default "http://127.0.0.1:4000"
    }
    "ollama" {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("OLLAMA_BASE_URL", "AI_BASE_URL", "OPENAI_BASE_URL") -Default "http://127.0.0.1:11434/v1"
    }
    default {
      Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_BASE_URL", "OPENAI_BASE_URL") -Default ""
    }
  }

  return [ordered]@{
    hasDotEnv = $hasDotEnv
    provider = $provider
    aiStack = $AiStack
    baseUrl = $baseUrl
    port = $port
    appUrl = "http://127.0.0.1:$port/"
    readyUrl = "http://127.0.0.1:$port/api/state?name=LauncherCheck"
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

function Confirm-DockerTooling {
  $dockerPath = Get-CommandPath -Name "docker"
  if (-not $dockerPath) {
    Fail "Docker was not found on PATH. Install Docker Desktop or Docker Engine with Compose support, then rerun this launcher."
  }

  Write-Info ("docker: {0}" -f $dockerPath)

  Invoke-Native -FilePath "docker" -ArgList @("compose", "version")

  $dockerInfo = Invoke-NativeCapture -FilePath "docker" -ArgList @("info", "--format", "{{.ServerVersion}}")
  if ($dockerInfo.ExitCode -ne 0) {
    $details = ($dockerInfo.Output -join [Environment]::NewLine).Trim()
    $guidance = @(
      "Docker is installed, but the Docker engine is not responding.",
      "Start Docker Desktop and wait for the Linux container engine to finish starting, then rerun this launcher.",
      "If Docker Desktop is already open, switch it to Linux containers and confirm `docker info` works in a new PowerShell window."
    )

    if (-not [string]::IsNullOrWhiteSpace($details)) {
      $guidance += ""
      $guidance += ("Docker said: {0}" -f $details)
    }

    Fail ($guidance -join [Environment]::NewLine)
  }

  $serverVersion = ($dockerInfo.Output -join "").Trim()
  if (-not [string]::IsNullOrWhiteSpace($serverVersion)) {
    Write-Info ("docker engine: {0}" -f $serverVersion)
  }
}

function Confirm-LocalGpuSupport {
  if ($AiStack -ne "local-gpu") {
    return
  }

  Write-Step "Checking optional local GPU prerequisites"

  $nvidiaSmi = Get-CommandPath -Name "nvidia-smi"
  if ($nvidiaSmi) {
    Write-Info ("nvidia-smi: {0}" -f $nvidiaSmi)
    return
  }

  Write-Info "No host nvidia-smi command was found on PATH. The Docker GPU override may still fail if NVIDIA drivers or the container runtime are not configured on this machine."
}

function Confirm-ProviderReady {
  param($Config)

  if ($AiStack -eq "local-gpu" -and $Config.provider -ne "litellm") {
    Fail "The local-gpu launcher mode expects AI_PROVIDER=litellm so the app can keep using the stable LiteLLM aliases. Change `.env` back to LiteLLM mode or rerun without -AiStack local-gpu."
  }

  Write-Step ("Checking AI provider: {0}" -f $Config.provider)
  if ($Config.provider -eq "litellm" -and $AiStack -in @("hosted", "local-gpu")) {
    Write-Info "Docker Compose will start the LiteLLM sidecar for this run."
    if ($AiStack -eq "local-gpu") {
      Write-Info "The local GPU override will also start the optional Ollama backend container."
    }
    return
  }

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

  if ($Config.provider -eq "litellm" -and $AiStack -in @("hosted", "local-gpu")) {
    $env:COMPOSE_AI_PROVIDER = "litellm"
    $env:COMPOSE_LITELLM_PROXY_URL = "http://litellm:4000"
    if ($AiStack -eq "local-gpu") {
      $env:COMPOSE_OLLAMA_BASE_URL = "http://ollama:11434/v1"
      $env:LITELLM_OLLAMA_BASE_URL = "http://ollama:11434"
    }
    return
  }

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

  Write-Step "Clearing any previous app container"
  Invoke-DockerCompose -ArgList @("down", "--remove-orphans")

  if (-not (Wait-ForPortReleased -Port $Config.port -TimeoutSeconds 15)) {
    Write-Info ("Port {0} still appears busy after docker compose down; checking again before launch." -f $Config.port)
  }

  Resolve-LaunchPort -Config $Config

  if ($Rebuild) {
    Write-Step "Rebuilding app image without cache"
    Invoke-DockerCompose -ArgList @("build", "--no-cache", "app")
  }

  Write-Step "Starting app container"
  Invoke-DockerCompose -ArgList @("up", "-d", "--build", "app")

  $containerId = Get-AppContainerId
  if ([string]::IsNullOrWhiteSpace($containerId)) {
    Fail "Docker Compose did not return an app container id."
  }

  if (-not (Wait-ForContainerHealthy -ContainerId $containerId -TimeoutSeconds 90)) {
    Write-Host ""
    Show-DockerComposeStatus
    Write-Host ""
    Show-DockerComposeLogs -Services (Get-DebugLogServices)
    Fail "App container did not become healthy."
  }

  if (-not (Wait-ForHttpReady -Uri $Config.readyUrl -TimeoutSeconds 20 -ExpectedContent '"player"')) {
    Write-Host ""
    Show-DockerComposeStatus
    Write-Host ""
    Show-DockerComposeLogs -Services (Get-DebugLogServices)
    Fail ("App container became healthy, but the app API was not confirmed at {0}." -f $Config.readyUrl)
  }

  Write-Info ("App server is ready at {0}" -f $Config.appUrl)
}

$dotEnv = Get-DotEnvMap -Path $dotEnvPath
$config = Resolve-ProviderConfig -DotEnv $dotEnv

Write-Host "Text Game Docker startup" -ForegroundColor Green
Write-Info ("repo: {0}" -f $repoRoot)
Write-Info ("ai stack: {0}" -f $AiStack)
Write-Info ("provider: {0}" -f $config.provider)
if ($config.hasDotEnv) {
  Write-Info "configuration: using .env"
} else {
  Write-Info "configuration: no .env found, using LiteLLM-first defaults for this run"
}

Confirm-DockerTooling
Confirm-LocalGpuSupport
Confirm-ProviderReady -Config $config
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
