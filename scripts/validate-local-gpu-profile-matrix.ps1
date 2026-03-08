$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$matrixPath = Join-Path $PSScriptRoot "local-gpu-profile-matrix.json"
$litellmConfigPath = Join-Path $repoRoot "litellm.local-gpu.config.yaml"

$script:Failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
  param([string]$Message)

  $script:Failures.Add($Message)
  Write-Host "FAIL: $Message" -ForegroundColor Red
}

function Add-Pass {
  param([string]$Message)

  Write-Host "PASS: $Message" -ForegroundColor Green
}

function Require-String {
  param(
    [string]$Name,
    $Value
  )

  if ($Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value)) {
    Add-Failure "$Name must be a non-empty string."
    return $false
  }

  return $true
}

function Require-NumberOrNull {
  param(
    [string]$Name,
    $Value
  )

  if ($null -eq $Value) {
    return $true
  }

  if ($Value -isnot [int] -and $Value -isnot [long] -and $Value -isnot [double]) {
    Add-Failure "$Name must be numeric or null."
    return $false
  }

  return $true
}

if (-not (Test-Path -LiteralPath $matrixPath)) {
  throw "Missing matrix file: $matrixPath"
}

if (-not (Test-Path -LiteralPath $litellmConfigPath)) {
  throw "Missing LiteLLM local GPU config: $litellmConfigPath"
}

$matrix = Get-Content -LiteralPath $matrixPath -Raw | ConvertFrom-Json
$litellmConfigText = Get-Content -LiteralPath $litellmConfigPath -Raw

if (($matrix.version -as [int]) -ne 1) {
  Add-Failure "version must be 1."
} else {
  Add-Pass "Matrix version is 1."
}

if (-not (Require-String -Name "defaultProfileId" -Value $matrix.defaultProfileId)) {
  $defaultProfileId = $null
} else {
  $defaultProfileId = [string]$matrix.defaultProfileId
}

if (-not ($matrix.profiles -is [System.Array])) {
  Add-Failure "profiles must be an array."
  $profiles = @()
} else {
  $profiles = @($matrix.profiles)
}

if ($profiles.Count -lt 1) {
  Add-Failure "profiles must contain at least one profile."
}

$ids = New-Object System.Collections.Generic.HashSet[string]
$minVrams = @()
$profileById = @{}

for ($index = 0; $index -lt $profiles.Count; $index++) {
  $profile = $profiles[$index]
  $pathPrefix = "profiles[$index]"

  $idOk = Require-String -Name "$pathPrefix.id" -Value $profile.id
  $displayOk = Require-String -Name "$pathPrefix.displayName" -Value $profile.displayName
  $chatOk = Require-String -Name "$pathPrefix.recommendedChatModel" -Value $profile.recommendedChatModel
  $statusOk = Require-String -Name "$pathPrefix.verificationStatus" -Value $profile.verificationStatus
  $minOk = Require-NumberOrNull -Name "$pathPrefix.minVramGb" -Value $profile.minVramGb
  $maxOk = Require-NumberOrNull -Name "$pathPrefix.maxVramGb" -Value $profile.maxVramGb

  if ($idOk) {
    $id = [string]$profile.id
    if (-not $ids.Add($id)) {
      Add-Failure "Duplicate profile id found: $id"
    } else {
      $profileById[$id] = $profile
    }
  }

  if ($statusOk -and $profile.verificationStatus -notin @("verified", "heuristic")) {
    Add-Failure "$pathPrefix.verificationStatus must be verified or heuristic."
  }

  if ($minOk -and $null -eq $profile.minVramGb) {
    Add-Failure "$pathPrefix.minVramGb must not be null."
  }

  if ($minOk -and $maxOk -and $null -ne $profile.maxVramGb -and [double]$profile.minVramGb -gt [double]$profile.maxVramGb) {
    Add-Failure "$pathPrefix.maxVramGb must be greater than or equal to minVramGb."
  }

  if ($minOk) {
    $minVrams += [double]$profile.minVramGb
  }

  if ($profile.recommendedEmbeddingRoute -isnot [pscustomobject]) {
    Add-Failure "$pathPrefix.recommendedEmbeddingRoute must be an object."
  } else {
    if (-not (Require-String -Name "$pathPrefix.recommendedEmbeddingRoute.mode" -Value $profile.recommendedEmbeddingRoute.mode)) {
      continue
    }

    if ($profile.recommendedEmbeddingRoute.mode -notin @("hosted", "local")) {
      Add-Failure "$pathPrefix.recommendedEmbeddingRoute.mode must be hosted or local."
    }

    $null = Require-String -Name "$pathPrefix.recommendedEmbeddingRoute.model" -Value $profile.recommendedEmbeddingRoute.model
    $null = Require-String -Name "$pathPrefix.recommendedEmbeddingRoute.aliasTarget" -Value $profile.recommendedEmbeddingRoute.aliasTarget
  }

  if (-not ($profile.ollamaPullModels -is [System.Array]) -or $profile.ollamaPullModels.Count -lt 1) {
    Add-Failure "$pathPrefix.ollamaPullModels must be a non-empty array."
  }

  if (-not ($profile.skuExamples -is [System.Array]) -or $profile.skuExamples.Count -lt 1) {
    Add-Failure "$pathPrefix.skuExamples must be a non-empty array."
  }

  if (-not ($profile.notes -is [System.Array]) -or $profile.notes.Count -lt 1) {
    Add-Failure "$pathPrefix.notes must be a non-empty array."
  }
}

for ($index = 1; $index -lt $minVrams.Count; $index++) {
  if ($minVrams[$index] -le $minVrams[$index - 1]) {
    Add-Failure "profiles must be ordered by ascending minVramGb."
    break
  }
}

if ($profiles.Count -gt 0) {
  for ($index = 0; $index -lt $profiles.Count - 1; $index++) {
    if ($null -eq $profiles[$index].maxVramGb) {
      Add-Failure "Only the last profile may use a null maxVramGb."
      break
    }
  }

  if ($null -ne $profiles[$profiles.Count - 1].maxVramGb) {
    Add-Failure "The last profile must use a null maxVramGb for the open-ended top tier."
  }
}

if ($defaultProfileId) {
  if (-not $profileById.ContainsKey($defaultProfileId)) {
    Add-Failure "defaultProfileId does not match any profile id."
  } else {
    Add-Pass "defaultProfileId resolves to an existing profile."
  }
}

foreach ($profile in $profiles) {
  $fallbackProfileId = $profile.fallbackProfileId
  if ($null -eq $fallbackProfileId) {
    continue
  }

  if ($fallbackProfileId -isnot [string] -or [string]::IsNullOrWhiteSpace($fallbackProfileId)) {
    Add-Failure "fallbackProfileId must be null or a non-empty string."
    continue
  }

  if (-not $profileById.ContainsKey($fallbackProfileId)) {
    Add-Failure ("fallbackProfileId '{0}' for profile '{1}' does not exist." -f $fallbackProfileId, $profile.id)
  }
}

$activeProfileMatch = [regex]::Match($litellmConfigText, "(?m)^#\s*active_profile_id:\s*(?<id>[a-z0-9\-]+)\s*$")
if (-not $activeProfileMatch.Success) {
  Add-Failure "litellm.local-gpu.config.yaml must declare '# active_profile_id: <profile-id>'."
} else {
  $activeProfileId = $activeProfileMatch.Groups["id"].Value
  if ($defaultProfileId -and $activeProfileId -ne $defaultProfileId) {
    Add-Failure ("Active LiteLLM profile '{0}' does not match defaultProfileId '{1}'." -f $activeProfileId, $defaultProfileId)
  } else {
    Add-Pass ("LiteLLM config active profile matches defaultProfileId: {0}" -f $activeProfileId)
  }
}

$defaultProfile = if ($defaultProfileId -and $profileById.ContainsKey($defaultProfileId)) { $profileById[$defaultProfileId] } else { $null }
if ($null -ne $defaultProfile) {
  $expectedChatLine = "model: ollama_chat/{0}" -f $defaultProfile.recommendedChatModel
  if ($litellmConfigText -notmatch [regex]::Escape($expectedChatLine)) {
    Add-Failure ("Active LiteLLM config is missing expected chat target: {0}" -f $expectedChatLine)
  } else {
    Add-Pass ("Active LiteLLM config chat target matches {0}" -f $defaultProfile.recommendedChatModel)
  }

  $embeddingRoute = $defaultProfile.recommendedEmbeddingRoute
  $expectedEmbeddingLine = if ($embeddingRoute.mode -eq "hosted") {
    "model: openai/{0}" -f $embeddingRoute.model
  } else {
    "model: ollama_embeddings/{0}" -f $embeddingRoute.model
  }

  if ($litellmConfigText -notmatch [regex]::Escape($expectedEmbeddingLine)) {
    Add-Failure ("Active LiteLLM config is missing expected embedding target: {0}" -f $expectedEmbeddingLine)
  } else {
    Add-Pass ("Active LiteLLM config embedding target matches {0}" -f $embeddingRoute.model)
  }
}

foreach ($profile in $profiles) {
  $profileMarker = "# profile_id: {0}" -f $profile.id
  if ($litellmConfigText -notmatch [regex]::Escape($profileMarker)) {
    Add-Failure ("litellm.local-gpu.config.yaml is missing the marker '{0}'." -f $profileMarker)
  }
}

if ($script:Failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Local GPU profile matrix validation failed." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Local GPU profile matrix validation passed." -ForegroundColor Green
