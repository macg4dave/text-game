$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$matrixPath = Join-Path $PSScriptRoot "local-gpu-profile-matrix.json"
$litellmConfigPath = Join-Path $repoRoot "litellm.local-gpu.config.yaml"
$dockerComposePath = Join-Path $repoRoot "docker-compose.yml"

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

function Get-ComposeEnvDefault {
  param(
    [string]$ComposeText,
    [string]$VariableName
  )

  $pattern = '(?m)^\s*{0}:\s*"\$\{{{0}:-(?<value>[^}}]*)\}}"\s*$' -f [regex]::Escape($VariableName)
  $match = [regex]::Match($ComposeText, $pattern)
  if (-not $match.Success) {
    return $null
  }

  return $match.Groups["value"].Value
}

if (-not (Test-Path -LiteralPath $matrixPath)) {
  throw "Missing matrix file: $matrixPath"
}

if (-not (Test-Path -LiteralPath $litellmConfigPath)) {
  throw "Missing LiteLLM local GPU config: $litellmConfigPath"
}

if (-not (Test-Path -LiteralPath $dockerComposePath)) {
  throw "Missing Docker Compose config: $dockerComposePath"
}

$matrix = Get-Content -LiteralPath $matrixPath -Raw | ConvertFrom-Json
$litellmConfigText = Get-Content -LiteralPath $litellmConfigPath -Raw
$dockerComposeText = Get-Content -LiteralPath $dockerComposePath -Raw

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
  $chatAliasMatch = [regex]::Match($litellmConfigText, '(?ms)^\s*-\s*model_name:\s*game-chat\s+litellm_params:\s+model:\s*(?<model>[^\r\n]+)\s+api_base:\s*(?<apiBase>[^\r\n]+)')
  if (-not $chatAliasMatch.Success) {
    Add-Failure "Active LiteLLM config must declare an uncommented game-chat alias block."
  } elseif ($chatAliasMatch.Groups["model"].Value.Trim() -ne "os.environ/LITELLM_LOCAL_GPU_CHAT_TARGET") {
    Add-Failure "Active LiteLLM config game-chat alias must resolve model from LITELLM_LOCAL_GPU_CHAT_TARGET."
  } else {
    Add-Pass "Active LiteLLM config game-chat alias uses the expected env-driven target."
  }

  if ($chatAliasMatch.Success) {
    if ($chatAliasMatch.Groups["apiBase"].Value.Trim() -ne "os.environ/LITELLM_LOCAL_GPU_CHAT_API_BASE") {
      Add-Failure "Active LiteLLM config game-chat alias must resolve api_base from LITELLM_LOCAL_GPU_CHAT_API_BASE."
    } else {
      Add-Pass "Active LiteLLM config game-chat alias uses the expected env-driven api_base."
    }
  }

  $embeddingAliasMatch = [regex]::Match($litellmConfigText, '(?ms)^\s*-\s*model_name:\s*game-embedding\s+litellm_params:\s+model:\s*(?<model>[^\r\n]+)\s+api_key:\s*(?<apiKey>[^\r\n]+)\s+api_base:\s*(?<apiBase>[^\r\n]+)')
  if (-not $embeddingAliasMatch.Success) {
    Add-Failure "Active LiteLLM config must declare an uncommented game-embedding alias block."
  } elseif ($embeddingAliasMatch.Groups["model"].Value.Trim() -ne "os.environ/LITELLM_LOCAL_GPU_EMBEDDING_TARGET") {
    Add-Failure "Active LiteLLM config game-embedding alias must resolve model from LITELLM_LOCAL_GPU_EMBEDDING_TARGET."
  } else {
    Add-Pass "Active LiteLLM config game-embedding alias uses the expected env-driven target."
  }

  if ($embeddingAliasMatch.Success) {
    if ($embeddingAliasMatch.Groups["apiKey"].Value.Trim() -ne "os.environ/LITELLM_LOCAL_GPU_EMBEDDING_API_KEY") {
      Add-Failure "Active LiteLLM config game-embedding alias must resolve api_key from LITELLM_LOCAL_GPU_EMBEDDING_API_KEY."
    } else {
      Add-Pass "Active LiteLLM config game-embedding alias uses the expected env-driven api_key."
    }
  }

  if ($embeddingAliasMatch.Success) {
    if ($embeddingAliasMatch.Groups["apiBase"].Value.Trim() -ne "os.environ/LITELLM_LOCAL_GPU_EMBEDDING_API_BASE") {
      Add-Failure "Active LiteLLM config game-embedding alias must resolve api_base from LITELLM_LOCAL_GPU_EMBEDDING_API_BASE."
    } else {
      Add-Pass "Active LiteLLM config game-embedding alias uses the expected env-driven api_base."
    }
  }

  $expectedComposeDefaults = [ordered]@{
    "LITELLM_LOCAL_GPU_PROFILE_ID" = [string]$defaultProfile.id
    "LITELLM_LOCAL_GPU_CHAT_TARGET" = "ollama_chat/$($defaultProfile.recommendedChatModel)"
    "LITELLM_LOCAL_GPU_CHAT_API_BASE" = "http://ollama:11434"
  }

  $embeddingRoute = $defaultProfile.recommendedEmbeddingRoute
  if ($embeddingRoute.mode -eq "hosted") {
    $expectedComposeDefaults["LITELLM_LOCAL_GPU_EMBEDDING_TARGET"] = "openai/$($embeddingRoute.model)"
    $expectedComposeDefaults["LITELLM_LOCAL_GPU_EMBEDDING_API_KEY"] = "sk-placeholder"
    $expectedComposeDefaults["LITELLM_LOCAL_GPU_EMBEDDING_API_BASE"] = ""
  } else {
    $expectedComposeDefaults["LITELLM_LOCAL_GPU_EMBEDDING_TARGET"] = "ollama_embeddings/$($embeddingRoute.model)"
    $expectedComposeDefaults["LITELLM_LOCAL_GPU_EMBEDDING_API_KEY"] = ""
    $expectedComposeDefaults["LITELLM_LOCAL_GPU_EMBEDDING_API_BASE"] = "http://ollama:11434"
  }

  foreach ($variableName in $expectedComposeDefaults.Keys) {
    $actualValue = Get-ComposeEnvDefault -ComposeText $dockerComposeText -VariableName $variableName
    if ($null -eq $actualValue) {
      Add-Failure ("docker-compose.yml is missing a default env value for {0}." -f $variableName)
      continue
    }

    if ($actualValue -ne $expectedComposeDefaults[$variableName]) {
      Add-Failure ("docker-compose.yml default for {0} must be '{1}', but was '{2}'." -f $variableName, $expectedComposeDefaults[$variableName], $actualValue)
    } else {
      Add-Pass ("docker-compose.yml default for {0} matches the active default profile." -f $variableName)
    }
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
