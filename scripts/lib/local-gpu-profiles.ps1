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
      -Notes @("Choose a supported GPU profile id with LOCAL_GPU_PROFILE_ID only if you intentionally want a smaller unsupported smoke-test setup.")
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
      -Notes @("Set a manual local GPU override only if you intentionally want an unsupported smoke-test setup.")
  }

  return New-LocalGpuSelectionResult `
    -Status "manual-selection-required" `
    -SelectionSource "detection-unavailable" `
    -RequestedProfile $RequestedProfile `
    -Message "GPU memory could not be detected automatically for the local GPU path." `
    -Notes @("Set LOCAL_GPU_PROFILE_ID to a specific matrix id or set LOCAL_GPU_VRAM_GB to the detected VRAM size in GB.")
}
