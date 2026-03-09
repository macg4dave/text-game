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
  param(
    [string[]]$ComposeFileArgs,
    [string[]]$ArgList
  )

  Invoke-Native -FilePath "docker" -ArgList (@("compose") + $ComposeFileArgs + $ArgList)
}

function Invoke-DockerComposeCapture {
  param(
    [string[]]$ComposeFileArgs,
    [string[]]$ArgList
  )

  return Invoke-NativeCapture -FilePath "docker" -ArgList (@("compose") + $ComposeFileArgs + $ArgList)
}

function Show-DockerComposeStatus {
  param([string[]]$ComposeFileArgs)

  & docker @(@("compose") + $ComposeFileArgs + @("ps"))
}

function Show-DockerComposeLogs {
  param(
    [string[]]$ComposeFileArgs,
    [string[]]$Services
  )

  & docker @(@("compose") + $ComposeFileArgs + @("logs", "--tail", "100") + $Services)
}

function Get-DebugLogServices {
  return @("app", "litellm", "ollama")
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
  param([string[]]$ComposeFileArgs)

  $result = Invoke-DockerComposeCapture -ComposeFileArgs $ComposeFileArgs -ArgList @("ps", "-q", "app")
  if ($result.ExitCode -ne 0) {
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "docker_compose_ps_failed" `
      -Title "The app container could not be identified" `
      -Message "Docker Compose did not return an app container id for the app service." `
      -Recovery @("Run `docker compose ps` to inspect the stack, then rerun the launcher.") `
      -Details @{
        compose_args = @($ComposeFileArgs)
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

function Start-AppContainer {
  param(
    $Config,
    [string[]]$ComposeFileArgs,
    [bool]$Rebuild
  )

  Write-Step "Clearing any previous app container"
  Invoke-DockerCompose -ComposeFileArgs $ComposeFileArgs -ArgList @("down", "--remove-orphans")

  if (-not (Wait-ForPortReleased -Port $Config.port -TimeoutSeconds 15)) {
    Write-Info ("Port {0} still appears busy after docker compose down; checking again before launch." -f $Config.port)
  }

  Resolve-LaunchPort -Config $Config

  if ($Rebuild) {
    Write-Step "Rebuilding app image without cache"
    Invoke-DockerCompose -ComposeFileArgs $ComposeFileArgs -ArgList @("build", "--no-cache", "app")
  }

  Write-Step "Starting app container"
  Invoke-DockerCompose -ComposeFileArgs $ComposeFileArgs -ArgList @("up", "-d", "--build", "app")

  $containerId = Get-AppContainerId -ComposeFileArgs $ComposeFileArgs
  if ([string]::IsNullOrWhiteSpace($containerId)) {
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "app_container_missing" `
      -Title "The app container did not start correctly" `
      -Message "Docker Compose did not return an app container id for the app service." `
      -Recovery @("Run `docker compose ps` and `docker compose logs app`, then rerun the launcher.") `
      -Details @{
        compose_args = @($ComposeFileArgs)
      })
  }

  if (-not (Wait-ForContainerHealthy -ContainerId $containerId -TimeoutSeconds 90)) {
    Write-Host ""
    Show-DockerComposeStatus -ComposeFileArgs $ComposeFileArgs
    Write-Host ""
    Show-DockerComposeLogs -ComposeFileArgs $ComposeFileArgs -Services (Get-DebugLogServices)
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
    Show-DockerComposeStatus -ComposeFileArgs $ComposeFileArgs
    Write-Host ""
    Show-DockerComposeLogs -ComposeFileArgs $ComposeFileArgs -Services (Get-DebugLogServices)
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
