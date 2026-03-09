function Get-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    return $null
  }

  return $command.Source
}

function Get-RegistryDefaultValue {
  param([string]$Path)

  try {
    return (Get-Item -LiteralPath $Path -ErrorAction Stop).GetValue("")
  } catch {
    return $null
  }
}

function Get-HttpBrowserHandler {
  $userChoicePath = "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice"

  try {
    $userChoice = Get-ItemProperty -LiteralPath $userChoicePath -Name "ProgId" -ErrorAction Stop
    if (-not [string]::IsNullOrWhiteSpace($userChoice.ProgId)) {
      $handler = Get-RegistryDefaultValue -Path ("Registry::HKEY_CLASSES_ROOT\{0}\shell\open\command" -f $userChoice.ProgId)
      if (-not [string]::IsNullOrWhiteSpace($handler)) {
        return $handler
      }
    }
  } catch {
  }

  return Get-RegistryDefaultValue -Path "Registry::HKEY_CLASSES_ROOT\http\shell\open\command"
}

function Get-HostPathPreflightIssues {
  param(
    [string]$RepoRoot,
    [bool]$NoBrowser,
    [double]$LauncherDiskWarningBytes,
    [double]$LauncherDiskBlockerBytes
  )

  $issues = New-Object System.Collections.Generic.List[object]
  $dataPath = Join-Path $RepoRoot "data"
  $writeProbe = Test-DirectoryWritable -Path $dataPath
  if (-not $writeProbe.ok) {
    $null = $issues.Add((New-PreflightIssue `
      -Severity "blocker" `
      -Area "storage" `
      -Code "launcher_data_path_unwritable" `
      -Title "Fix the app data folder permissions" `
      -Message ("The launcher could not create a temporary file in {0}." -f $dataPath) `
      -Recovery @(
        ("Confirm that {0} exists on a writable drive and your user account can create files there." -f $dataPath),
        "Restart the launcher after fixing the folder permissions or moving the project to a writable location."
      ) `
      -Details @{
        check = "launcher-data-path"
        probe_target = $dataPath
        notes = @($writeProbe.error)
      }))
  }

  $freeBytes = Get-PathFreeSpaceBytes -Path $dataPath
  if ($null -ne $freeBytes) {
    if ($freeBytes -lt $LauncherDiskBlockerBytes) {
      $null = $issues.Add((New-PreflightIssue `
        -Severity "blocker" `
        -Area "storage" `
        -Code "launcher_disk_space_blocker" `
        -Title "Free up disk space before launching the game" `
        -Message ("The drive that contains {0} only has {1} free." -f $dataPath, (Format-ByteCount -Bytes $freeBytes)) `
        -Recovery @(
          ("Free up space on the drive that contains {0} before launching the game." -f $dataPath),
          ("Keep at least {0} free so builds, saves, and logs have room to work." -f (Format-ByteCount -Bytes $LauncherDiskWarningBytes))
        ) `
        -Details @{
          check = "launcher-disk-space"
          probe_target = $dataPath
          resolved_value = [math]::Round($freeBytes)
        }))
    } elseif ($freeBytes -lt $LauncherDiskWarningBytes) {
      $null = $issues.Add((New-PreflightIssue `
        -Severity "warning" `
        -Area "storage" `
        -Code "launcher_disk_space_warning" `
        -Title "App storage is getting low" `
        -Message ("The drive that contains {0} is down to {1} free." -f $dataPath, (Format-ByteCount -Bytes $freeBytes)) `
        -Recovery @(
          ("Free up space on the drive that contains {0} soon." -f $dataPath),
          ("Keeping at least {0} free will reduce the risk of save or log failures." -f (Format-ByteCount -Bytes $LauncherDiskWarningBytes))
        ) `
        -Details @{
          check = "launcher-disk-space"
          probe_target = $dataPath
          resolved_value = [math]::Round($freeBytes)
        }))
    }
  }

  if (-not $NoBrowser) {
    $browserHandler = Get-HttpBrowserHandler
    if ([string]::IsNullOrWhiteSpace($browserHandler)) {
      $null = $issues.Add((New-PreflightIssue `
        -Severity "blocker" `
        -Area "host" `
        -Code "browser_handler_missing" `
        -Title "Set a default browser before launching the game" `
        -Message "Windows did not report a default handler for HTTP links, so the launcher would not be able to open the play surface automatically." `
        -Recovery @(
          "Set a default browser for HTTP links in Windows Settings, then rerun the launcher.",
          "If you only need the server for this run, rerun the launcher with -NoBrowser."
        ) `
        -Details @{
          check = "default-browser"
        }))
    }
  }

  return @($issues.ToArray())
}

function Confirm-HostPathPrerequisites {
  param(
    [string]$RepoRoot,
    [bool]$NoBrowser,
    [double]$LauncherDiskWarningBytes,
    [double]$LauncherDiskBlockerBytes
  )

  $issues = @(Get-HostPathPreflightIssues -RepoRoot $RepoRoot -NoBrowser:$NoBrowser -LauncherDiskWarningBytes $LauncherDiskWarningBytes -LauncherDiskBlockerBytes $LauncherDiskBlockerBytes)
  if ($issues.Count -eq 0) {
    return
  }

  Write-Step "Checking host path prerequisites"
  Show-PreflightIssues -Issues $issues

  $blockingIssues = @($issues | Where-Object { $_.severity -eq "blocker" })
  if ($blockingIssues.Count -gt 0) {
    Fail-PreflightIssue $blockingIssues[0]
  }
}

function Resolve-LauncherProviderConfig {
  param(
    [hashtable]$DotEnv,
    [string]$DotEnvPath
  )

  $config = Resolve-RepoAiConfig -DotEnv $DotEnv -HasDotEnv (Test-Path -LiteralPath $DotEnvPath) -IncludePort
  if ($config.profile -notin @("local-gpu-small", "local-gpu-large")) {
    $config.profile = "local-gpu-small"
  }
  $config.provider = "litellm"
  $port = $config.port
  $config.appUrl = "http://127.0.0.1:$port/"
  $config.readyUrl = "http://127.0.0.1:$port/api/state?name=LauncherCheck"
  return $config
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

  $composeVersion = Invoke-NativeCapture -FilePath "docker" -ArgList @("compose", "version", "--short")
  if ($composeVersion.ExitCode -ne 0) {
    $details = ($composeVersion.Output -join [Environment]::NewLine).Trim()
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "host" `
      -Code "docker_compose_missing" `
      -Title "Install Docker Compose support before launching the game" `
      -Message "Docker is installed, but `docker compose` is not available in this shell." `
      -Recovery @(
        "Update Docker Desktop or Docker Engine so the Compose plugin is available.",
        "Open a new PowerShell window after the update, confirm `docker compose version` works, then rerun the launcher."
      ) `
      -Details @{
        check = "docker compose version"
        docker_output = $details
      })
  }

  $composeVersionText = ($composeVersion.Output -join "").Trim()
  if (-not [string]::IsNullOrWhiteSpace($composeVersionText)) {
    Write-Info ("docker compose: {0}" -f $composeVersionText)
  }

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

  $dockerOsType = Invoke-NativeCapture -FilePath "docker" -ArgList @("info", "--format", "{{.OSType}}")
  if ($dockerOsType.ExitCode -eq 0) {
    $osType = ($dockerOsType.Output -join "").Trim().ToLowerInvariant()
    if (-not [string]::IsNullOrWhiteSpace($osType)) {
      Write-Info ("docker runtime: {0} containers" -f $osType)
    }

    if ($osType -and $osType -ne "linux") {
      Fail-PreflightIssue (New-PreflightIssue `
        -Severity "blocker" `
        -Area "host" `
        -Code "docker_linux_containers_required" `
        -Title "Switch Docker to Linux containers before launching the game" `
        -Message "The supported launcher path expects the Docker Linux container runtime, but Docker is currently using Windows containers." `
        -Recovery @(
          "Switch Docker Desktop back to Linux containers, confirm `docker info` reports `OSType=linux`, then rerun the launcher."
        ) `
        -Details @{
          check = "docker info"
          resolved_value = $osType
        })
    }
  }
}

function Confirm-LocalGpuSupport {
  Write-Step "Checking NVIDIA GPU prerequisites"

  $gpuInfo = Get-NvidiaGpuVramInfo
  if ($gpuInfo.available) {
    $gpuLines = @($gpuInfo.gpus | ForEach-Object { "{0} ({1} GB)" -f $_.name, $_.memoryGb })
    Write-Info ($gpuInfo.message)
    foreach ($gpuLine in $gpuLines) {
      Write-Info ("gpu: {0}" -f $gpuLine)
    }

    $runtimeInfo = Invoke-NativeCapture -FilePath "docker" -ArgList @("info", "--format", "{{json .Runtimes}}")
    if ($runtimeInfo.ExitCode -eq 0) {
      $runtimeJson = ($runtimeInfo.Output -join "").Trim()
      if (-not [string]::IsNullOrWhiteSpace($runtimeJson) -and $runtimeJson -notmatch '"nvidia"') {
        Fail-PreflightIssue (New-PreflightIssue `
          -Severity "blocker" `
          -Area "host" `
          -Code "docker_nvidia_runtime_missing" `
          -Title "Enable Docker NVIDIA GPU support before launching the game" `
          -Message "Docker is running, but it did not report an NVIDIA runtime for the GPU-backed Ollama path." `
          -Recovery @(
            "Enable NVIDIA GPU support in Docker Desktop and WSL2, then confirm `docker info` shows an `nvidia` runtime.",
            "Rerun the launcher after Docker Desktop reports the Linux engine as ready."
          ) `
          -Details @{
            check = "docker info"
            resolved_value = $runtimeJson
          })
      }
    }

    return $gpuInfo
  }

  Fail-PreflightIssue (New-PreflightIssue `
    -Severity "blocker" `
    -Area "host" `
    -Code "gpu_tooling_not_detected" `
    -Title "Install NVIDIA GPU tooling before launching the game" `
    -Message "This launcher only supports the GPU-backed Docker Ollama path, and `nvidia-smi` was not available on the host." `
    -Recovery @(
      "Install or repair the NVIDIA driver stack until `nvidia-smi` works in PowerShell.",
      "Open a new PowerShell window and rerun this launcher after `nvidia-smi` reports your GPU."
    ) `
    -Details @{
      check = "nvidia-smi"
    })
}

function Confirm-ProviderReady {
  param($Config)

  if ($Config.provider -ne "litellm") {
    Fail-PreflightIssue (New-PreflightIssue `
      -Severity "blocker" `
      -Area "config" `
      -Code "launcher_requires_litellm" `
      -Title "Use LiteLLM mode for the GPU-backed launcher" `
      -Message "The Windows launcher now always uses the GPU-backed Docker LiteLLM stack so the app can keep using the stable gateway aliases." `
      -Recovery @("Remove custom direct-provider launcher overrides and rerun the launcher so it can start the repo-managed LiteLLM and Ollama containers.") `
      -EnvVars @("AI_PROVIDER") `
      -Details @{
        provider = $Config.provider
      })
  }

  Write-Step ("Checking AI provider: {0}" -f $Config.provider)
  Write-Info "Docker Compose will start the LiteLLM sidecar and the GPU-backed Ollama container for this run."
}

function Set-ComposeOverrides {
  param($Config)

  $env:AI_PROFILE = $Config.profile
  $env:COMPOSE_AI_PROVIDER = "litellm"
  $env:COMPOSE_LITELLM_PROXY_URL = "http://litellm:4000"
  $env:COMPOSE_OLLAMA_BASE_URL = "http://ollama:11434/v1"
  $env:LITELLM_OLLAMA_BASE_URL = "http://ollama:11434"
}
