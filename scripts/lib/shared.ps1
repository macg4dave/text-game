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

function Format-ByteCount {
  param([double]$Bytes)

  if ($Bytes -ge 1GB) {
    return ("{0:N1} GB" -f ($Bytes / 1GB))
  }

  return ("{0:N0} MB" -f [Math]::Max(1, [Math]::Round($Bytes / 1MB)))
}

function Get-LocalGpuProfileMatrix {
  param([string]$MatrixPath)

  if ([string]::IsNullOrWhiteSpace($MatrixPath)) {
    $scriptsRoot = Split-Path -Parent $PSScriptRoot
    $MatrixPath = Join-Path $scriptsRoot "local-gpu-profile-matrix.json"
  }

  if (-not (Test-Path -LiteralPath $MatrixPath)) {
    throw "Missing local GPU profile matrix: $MatrixPath"
  }

  $matrix = Get-Content -LiteralPath $MatrixPath -Raw | ConvertFrom-Json
  if ($null -eq $matrix -or $matrix.profiles -isnot [System.Array] -or $matrix.profiles.Count -lt 1) {
    throw "Local GPU profile matrix is missing its profiles array."
  }

  return $matrix
}

function Get-LocalGpuProfileById {
  param(
    $Matrix,
    [string]$ProfileId
  )

  if ($null -eq $Matrix -or [string]::IsNullOrWhiteSpace($ProfileId)) {
    return $null
  }

  foreach ($profile in @($Matrix.profiles)) {
    if ([string]$profile.id -eq $ProfileId) {
      return $profile
    }
  }

  return $null
}

function Find-LocalGpuProfileForVram {
  param(
    $Matrix,
    [double]$VramGb
  )

  foreach ($profile in @($Matrix.profiles)) {
    $minVram = [double]$profile.minVramGb
    $maxVram = if ($null -eq $profile.maxVramGb) { $null } else { [double]$profile.maxVramGb }

    if ($VramGb -lt $minVram) {
      continue
    }

    if ($null -ne $maxVram -and $VramGb -gt $maxVram) {
      continue
    }

    return $profile
  }

  return $null
}

function Get-LocalGpuSupportedProfileIds {
  param($Matrix)

  return @($Matrix.profiles | ForEach-Object { [string]$_.id })
}

function Get-LocalGpuMinimumVramGb {
  param($Matrix)

  $firstProfile = @($Matrix.profiles | Select-Object -First 1)
  if ($firstProfile.Count -eq 0) {
    return $null
  }

  return [double]$firstProfile[0].minVramGb
}

function Get-NvidiaGpuVramInfo {
  $nvidiaSmi = Get-Command "nvidia-smi" -ErrorAction SilentlyContinue
  if ($null -eq $nvidiaSmi) {
    return [pscustomobject]@{
      available = $false
      source = "nvidia-smi"
      detectedVramGb = $null
      gpus = @()
      message = "nvidia-smi was not found on PATH."
    }
  }

  $output = & $nvidiaSmi.Source --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $output) {
    return [pscustomobject]@{
      available = $false
      source = "nvidia-smi"
      detectedVramGb = $null
      gpus = @()
      message = "nvidia-smi did not return GPU memory information."
    }
  }

  $gpuRows = @()
  foreach ($line in @($output)) {
    $text = [string]$line
    if ([string]::IsNullOrWhiteSpace($text)) {
      continue
    }

    $parts = $text.Split(",", 2)
    if ($parts.Count -lt 2) {
      continue
    }

    $name = $parts[0].Trim()
    $memoryText = $parts[1].Trim()
    $memoryMb = 0.0
    if (-not [double]::TryParse($memoryText, [ref]$memoryMb)) {
      continue
    }

    $gpuRows += [pscustomobject]@{
      name = $name
      memoryMb = [double]$memoryMb
      memoryGb = [math]::Round(($memoryMb / 1024), 1)
    }
  }

  if ($gpuRows.Count -lt 1) {
    return [pscustomobject]@{
      available = $false
      source = "nvidia-smi"
      detectedVramGb = $null
      gpus = @()
      message = "nvidia-smi returned output, but no GPU memory rows could be parsed."
    }
  }

  $maxGpu = $gpuRows | Sort-Object -Property memoryMb -Descending | Select-Object -First 1
  return [pscustomobject]@{
    available = $true
    source = "nvidia-smi"
    detectedVramGb = [double]$maxGpu.memoryGb
    gpus = @($gpuRows)
    message = ("Detected {0} GPU(s); using the largest single-GPU VRAM value ({1} GB)." -f $gpuRows.Count, $maxGpu.memoryGb)
  }
}

function New-LocalGpuSelectionResult {
  param(
    [string]$Status,
    [string]$SelectionSource,
    $Profile = $null,
    $DetectedVramGb = $null,
    $ManualVramGb = $null,
    [string]$ManualProfileId = "",
    [string]$RequestedProfile = "local-gpu-small",
    [string]$Message = "",
    [string[]]$Notes = @()
  )

  return [pscustomobject]@{
    status = $Status
    selectionSource = $SelectionSource
    requestedProfile = $RequestedProfile
    profileId = if ($null -ne $Profile) { [string]$Profile.id } else { $null }
    profileLabel = if ($null -ne $Profile) { [string]$Profile.displayName } else { $null }
    verificationStatus = if ($null -ne $Profile) { [string]$Profile.verificationStatus } else { $null }
    detectedVramGb = $DetectedVramGb
    manualVramGb = $ManualVramGb
    manualProfileId = if ([string]::IsNullOrWhiteSpace($ManualProfileId)) { $null } else { $ManualProfileId }
    chatModel = if ($null -ne $Profile) { [string]$Profile.recommendedChatModel } else { $null }
    embeddingMode = if ($null -ne $Profile) { [string]$Profile.recommendedEmbeddingRoute.mode } else { $null }
    embeddingModel = if ($null -ne $Profile) { [string]$Profile.recommendedEmbeddingRoute.model } else { $null }
    embeddingAliasTarget = if ($null -ne $Profile) { [string]$Profile.recommendedEmbeddingRoute.aliasTarget } else { $null }
    fallbackProfileId = if ($null -ne $Profile -and $null -ne $Profile.fallbackProfileId) { [string]$Profile.fallbackProfileId } else { $null }
    ollamaPullModels = if ($null -ne $Profile) { @($Profile.ollamaPullModels) } else { @() }
    notes = @($Notes + $(if ($null -ne $Profile) { @($Profile.notes) } else { @() }))
    message = $Message
  }
}

function Resolve-LocalGpuProfileSelection {
  param(
    $Matrix,
    [string]$RequestedProfile = "local-gpu-small",
    [string]$ManualProfileId = "",
    $ManualVramGb = $null,
    $DetectedVramGb = $null
  )

  if ($null -eq $Matrix) {
    throw "Resolve-LocalGpuProfileSelection requires a matrix object."
  }

  $supportedIds = Get-LocalGpuSupportedProfileIds -Matrix $Matrix
  $minimumVramGb = Get-LocalGpuMinimumVramGb -Matrix $Matrix
  $manualProfile = if ([string]::IsNullOrWhiteSpace($ManualProfileId)) { $null } else { Get-LocalGpuProfileById -Matrix $Matrix -ProfileId $ManualProfileId.Trim() }

  if (-not [string]::IsNullOrWhiteSpace($ManualProfileId) -and $null -eq $manualProfile) {
    return New-LocalGpuSelectionResult `
      -Status "manual-selection-required" `
      -SelectionSource "invalid-manual-profile" `
      -ManualProfileId $ManualProfileId `
      -RequestedProfile $RequestedProfile `
      -Message ("LOCAL_GPU_PROFILE_ID did not match a supported profile id. Supported values: {0}." -f ($supportedIds -join ", ")) `
      -Notes @("Set LOCAL_GPU_PROFILE_ID to one of the supported matrix ids or remove it to use auto-detection.")
  }

  if ($null -ne $manualProfile) {
    return New-LocalGpuSelectionResult `
      -Status "selected" `
      -SelectionSource "manual-profile" `
      -Profile $manualProfile `
      -DetectedVramGb $DetectedVramGb `
      -ManualVramGb $ManualVramGb `
      -ManualProfileId $ManualProfileId `
      -RequestedProfile $RequestedProfile `
      -Message ("Using the manually selected local GPU profile '{0}'." -f $manualProfile.displayName)
  }

  $resolvedManualVram = $null
  if ($null -ne $ManualVramGb -and "" -ne [string]$ManualVramGb) {
    $parsedManualVram = 0.0
    if ([double]::TryParse([string]$ManualVramGb, [ref]$parsedManualVram)) {
      $resolvedManualVram = [math]::Round($parsedManualVram, 1)
    }
  }

  if ($null -ne $resolvedManualVram) {
    $manualVramProfile = Find-LocalGpuProfileForVram -Matrix $Matrix -VramGb $resolvedManualVram
    if ($null -ne $manualVramProfile) {
      return New-LocalGpuSelectionResult `
        -Status "selected" `
        -SelectionSource "manual-vram" `
        -Profile $manualVramProfile `
        -ManualVramGb $resolvedManualVram `
        -RequestedProfile $RequestedProfile `
        -Message ("Using the profile that matches the manual LOCAL_GPU_VRAM_GB override ({0} GB)." -f $resolvedManualVram)
    }

    return New-LocalGpuSelectionResult `
      -Status "manual-selection-required" `
      -SelectionSource "unsupported-vram" `
      -ManualVramGb $resolvedManualVram `
      -RequestedProfile $RequestedProfile `
      -Message ("The manual LOCAL_GPU_VRAM_GB override ({0} GB) is below the supported minimum tier of {1} GB." -f $resolvedManualVram, $minimumVramGb) `
      -Notes @("Choose the hosted-default path or set LOCAL_GPU_PROFILE_ID to an intentionally smaller manual test profile if you know what you are doing.")
  }

  $resolvedDetectedVram = $null
  if ($null -ne $DetectedVramGb -and "" -ne [string]$DetectedVramGb) {
    $parsedDetectedVram = 0.0
    if ([double]::TryParse([string]$DetectedVramGb, [ref]$parsedDetectedVram)) {
      $resolvedDetectedVram = [math]::Round($parsedDetectedVram, 1)
    }
  }

  if ($null -ne $resolvedDetectedVram) {
    $detectedProfile = Find-LocalGpuProfileForVram -Matrix $Matrix -VramGb $resolvedDetectedVram
    if ($null -ne $detectedProfile) {
      return New-LocalGpuSelectionResult `
        -Status "selected" `
        -SelectionSource "detected-vram" `
        -Profile $detectedProfile `
        -DetectedVramGb $resolvedDetectedVram `
        -RequestedProfile $RequestedProfile `
        -Message ("Auto-selected '{0}' from detected GPU memory ({1} GB)." -f $detectedProfile.displayName, $resolvedDetectedVram)
    }

    return New-LocalGpuSelectionResult `
      -Status "manual-selection-required" `
      -SelectionSource "unsupported-vram" `
      -DetectedVramGb $resolvedDetectedVram `
      -RequestedProfile $RequestedProfile `
      -Message ("Detected GPU memory ({0} GB) is below the supported minimum tier of {1} GB for this local GPU path." -f $resolvedDetectedVram, $minimumVramGb) `
      -Notes @("Switch back to the hosted-default path or set a manual local GPU override only if you intentionally want an unsupported smoke-test setup.")
  }

  return New-LocalGpuSelectionResult `
    -Status "manual-selection-required" `
    -SelectionSource "detection-unavailable" `
    -RequestedProfile $RequestedProfile `
    -Message "GPU memory could not be detected automatically for the local GPU path." `
    -Notes @("Set LOCAL_GPU_PROFILE_ID to a specific matrix id or set LOCAL_GPU_VRAM_GB to the detected VRAM size in GB.")
}

function Get-PathFreeSpaceBytes {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $null
  }

  try {
    $root = [System.IO.Path]::GetPathRoot($Path)
    if ([string]::IsNullOrWhiteSpace($root)) {
      return $null
    }

    $driveInfo = [System.IO.DriveInfo]::new($root)
    if (-not $driveInfo.IsReady) {
      return $null
    }

    return [double]$driveInfo.AvailableFreeSpace
  } catch {
    return $null
  }
}

function Test-DirectoryWritable {
  param([string]$Path)

  $probePath = $null
  try {
    if (-not (Test-Path -LiteralPath $Path)) {
      $null = New-Item -ItemType Directory -Path $Path -Force
    }

    $probePath = Join-Path $Path (".preflight-write-{0}-{1}.tmp" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    Set-Content -LiteralPath $probePath -Value "ok" -Encoding utf8
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue

    return [pscustomobject]@{
      ok = $true
      path = $Path
      error = $null
    }
  } catch {
    if ($probePath) {
      Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
    }

    return [pscustomobject]@{
      ok = $false
      path = $Path
      error = $_.Exception.Message
    }
  }
}

function Resolve-RepoAiConfig {
  param(
    [hashtable]$DotEnv,
    [bool]$HasDotEnv = $false,
    [switch]$IncludePort
  )

  $profile = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_PROFILE") -Default "hosted-default"
  if ([string]::IsNullOrWhiteSpace($profile)) {
    $profile = "hosted-default"
  }
  $profile = $profile.Trim().ToLowerInvariant()

  if ($profile -notin @("hosted-default", "local-gpu-small", "local-gpu-large", "custom")) {
    $profile = "hosted-default"
  }

  $provider = Get-ConfigValue -DotEnv $DotEnv -Keys @("AI_PROVIDER") -Default ""
  if (-not (Test-AnyConfigValuePresent -DotEnv $DotEnv -Keys @("AI_PROVIDER")) -and $profile -ne "custom") {
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
    profile = $profile
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
