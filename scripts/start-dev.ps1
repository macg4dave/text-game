param(
  [switch]$NoBrowser,
  [switch]$Rebuild,
  [ValidateSet("hosted", "local-gpu")]
  [string]$AiStack = "hosted"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$sharedScriptPath = Join-Path $PSScriptRoot "lib\shared.ps1"
. $sharedScriptPath
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

function New-PreflightIssue {
  param(
    [ValidateSet("blocker", "warning", "info")]
    [string]$Severity,
    [ValidateSet("config", "ai", "host", "storage")]
    [string]$Area,
    [string]$Code,
    [string]$Title,
    [string]$Message,
    [string[]]$Recovery = @(),
    [string[]]$EnvVars = @(),
    [hashtable]$Details = @{}
  )

  return [pscustomobject]@{
    code = $Code
    severity = $Severity
    area = $Area
    title = $Title
    message = $Message
    recovery = @($Recovery)
    recommended_fix = if ($Recovery.Count -gt 0) { $Recovery[0] } else { $null }
    env_vars = @($EnvVars)
    details = if ($Details.Count -gt 0) { $Details } else { $null }
  }
}

function Get-PreflightColor {
  param([string]$Severity)

  switch ($Severity) {
    "blocker" { return "Red" }
    "warning" { return "Yellow" }
    default { return "DarkCyan" }
  }
}

function Format-PreflightIssue {
  param($Issue)

  $lines = @(
    ("[{0}] {1}" -f $Issue.severity.ToUpperInvariant(), $Issue.title),
    $Issue.message
  )

  if (-not [string]::IsNullOrWhiteSpace($Issue.recommended_fix)) {
    $lines += ("Recommended next step: {0}" -f $Issue.recommended_fix)
  }

  if ($Issue.env_vars -and $Issue.env_vars.Count -gt 0) {
    $lines += ("Env vars: {0}" -f ($Issue.env_vars -join ", "))
  }

  if ($Issue.details) {
    $lines += "Advanced details:"
    $lines += ($Issue.details | ConvertTo-Json -Depth 6)
  }

  return $lines -join [Environment]::NewLine
}

function Show-PreflightIssues {
  param([object[]]$Issues)

  foreach ($issue in $Issues) {
    if ($null -eq $issue) {
      continue
    }

    Write-Host (Format-PreflightIssue -Issue $issue) -ForegroundColor (Get-PreflightColor -Severity $issue.severity)
    Write-Host ""
  }
}

function Fail-PreflightIssue {
  param($Issue)

  Fail (Format-PreflightIssue -Issue $Issue)
}

function Invoke-Native {
  param(
    [string]$FilePath,
    [string[]]$ArgList
  )

  & $FilePath @ArgList
  if ($LASTEXITCODE -ne 0) {
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "native_command_failed" `
      -Title "A required host command failed" `
      -Message ("The launcher could not complete `{0}`." -f $FilePath) `
      -Recovery @("Review the command output above, fix the reported host issue, and rerun the launcher.") `
      -Details @{
        command = $FilePath
        arguments = @($ArgList)
      })
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

function Get-AppPreflight {
  param($Config)

  try {
    $response = Invoke-WebRequest -Uri $Config.readyUrl -Method Get -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
      return $null
    }

    $payload = $response.Content | ConvertFrom-Json -Depth 12
    return $payload.debug.runtime.preflight
  } catch {
    return $null
  }
}

function Show-AppPreflight {
  param($Config)

  $preflight = Get-AppPreflight -Config $Config
  if ($null -eq $preflight) {
    return
  }

  $issues = @($preflight.issues)
  if ($issues.Count -eq 0) {
    return
  }

  Write-Step "Startup checks reported by the app"
  Show-PreflightIssues -Issues $issues

  if ($preflight.status -eq "action-required") {
    Write-Info "The app is reachable, but the first turn will stay blocked until those setup blockers are fixed."
  } elseif (($preflight.counts.warning -gt 0) -or ($preflight.counts.info -gt 0)) {
    Write-Info "The app is reachable. These startup notes do not block play."
  }
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

  Fail-PreflightIssue (New-PreflightIssue `
    -Severity "blocker" `
    -Area "host" `
    -Code "app_port_in_use" `
    -Title "Choose a different app port" `
    -Message $guidance[0] `
    -Recovery @($guidance[1]) `
    -EnvVars @("PORT") `
    -Details @{
      port = $Config.port
      owning_process = $portProcess
    })
}

function Get-AppContainerId {
  $result = Invoke-DockerComposeCapture -ArgList @("ps", "-q", "app")
  if ($result.ExitCode -ne 0) {
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "docker_compose_ps_failed" `
      -Title "The app container could not be identified" `
      -Message "Docker Compose did not return an app container id for the app service." `
      -Recovery @("Run `docker compose ps` to inspect the stack, then rerun the launcher.") `
      -Details @{
        compose_args = @($composeFileArgs)
        output = ($result.Output -join [Environment]::NewLine)
      })
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
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "docker_missing" `
      -Title "Install Docker before starting the game" `
      -Message "Docker was not found on PATH, so the supported startup path cannot launch the app and LiteLLM sidecar." `
      -Recovery @("Install Docker Desktop or Docker Engine with Compose support, then rerun this launcher.") `
      -Details @{
        check = "docker"
      })
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

    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "docker_engine_unavailable" `
      -Title "Start Docker Desktop before launching the game" `
      -Message $guidance[0] `
      -Recovery @($guidance[1], $guidance[2]) `
      -Details @{
        check = "docker info"
        docker_output = $details
      })
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
  Show-PreflightIssues -Issues @(
    (New-PreflightIssue `
      -Severity "warning" `
      -Area "host" `
      -Code "gpu_tooling_not_detected" `
      -Title "GPU tooling was not detected on the host" `
      -Message "The optional local GPU path may fail because `nvidia-smi` is not available on PATH." `
      -Recovery @("If the GPU path fails, switch back to the hosted default path or install the required NVIDIA tooling first.") `
      -Details @{
        ai_stack = $AiStack
        check = "nvidia-smi"
      })
  )
}

function Confirm-ProviderReady {
  param($Config)

  if ($AiStack -eq "local-gpu" -and $Config.provider -ne "litellm") {
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "config" `
      -Code "local_gpu_requires_litellm" `
      -Title "Use LiteLLM mode for the local GPU override" `
      -Message "The local-gpu launcher mode expects AI_PROVIDER=litellm so the app can keep using the stable LiteLLM aliases." `
      -Recovery @("Change `.env` back to AI_PROVIDER=litellm, or rerun the launcher without `-AiStack local-gpu`.") `
      -EnvVars @("AI_PROVIDER") `
      -Details @{
        ai_stack = $AiStack
        provider = $Config.provider
      })
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

    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "ai" `
      -Code "local_ai_endpoint_unreachable" `
      -Title "Start or fix the local AI service" `
      -Message ("The configured local AI endpoint did not respond at {0}." -f $probeUrl) `
      -Recovery @("Start the local AI service and confirm the configured base URL points at the running API.") `
      -Details @{
        provider = $Config.provider
        probe_target = $probeUrl
      })
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
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "app_container_missing" `
      -Title "The app container did not start correctly" `
      -Message "Docker Compose did not return an app container id for the app service." `
      -Recovery @("Run `docker compose ps` and `docker compose logs app`, then rerun the launcher.") `
      -Details @{
        compose_args = @($composeFileArgs)
      })
  }

  if (-not (Wait-ForContainerHealthy -ContainerId $containerId -TimeoutSeconds 90)) {
    Write-Host ""
    Show-DockerComposeStatus
    Write-Host ""
    Show-DockerComposeLogs -Services (Get-DebugLogServices)
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "app_container_unhealthy" `
      -Title "The app container never became healthy" `
      -Message "Docker started the app container, but it did not report a healthy state in time." `
      -Recovery @("Review the container logs above, fix the startup failure, and rerun the launcher.") `
      -Details @{
        container_id = $containerId
        ready_url = $Config.readyUrl
      })
  }

  if (-not (Wait-ForHttpReady -Uri $Config.readyUrl -TimeoutSeconds 20 -ExpectedContent '"player"')) {
    Write-Host ""
    Show-DockerComposeStatus
    Write-Host ""
    Show-DockerComposeLogs -Services (Get-DebugLogServices)
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "app_api_not_ready" `
      -Title "The app started, but the player surface was not ready" `
      -Message ("The app container became healthy, but the app API was not confirmed at {0}." -f $Config.readyUrl) `
      -Recovery @("Review the container logs above, confirm the server is listening on the expected port, and rerun the launcher.") `
      -Details @{
        container_id = $containerId
        probe_target = $Config.readyUrl
      })
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
Show-AppPreflight -Config $config

if (-not $NoBrowser) {
  Write-Step "Opening browser"
  Start-Process $config.appUrl
} else {
  Write-Info "Skipping browser open because -NoBrowser was provided."
}

Write-Host ""
Write-Host ("Ready: {0}" -f $config.appUrl) -ForegroundColor Green
