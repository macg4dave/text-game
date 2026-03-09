param(
  [switch]$SelectionOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$sharedScriptPath = Join-Path $PSScriptRoot "lib\shared.ps1"
. $sharedScriptPath

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

function Assert-Equal {
  param(
    [string]$Name,
    $Actual,
    $Expected
  )

  if ($Actual -ne $Expected) {
    Add-Failure ("{0} expected '{1}' but got '{2}'." -f $Name, $Expected, $Actual)
    return
  }

  Add-Pass ("{0} matches {1}." -f $Name, $Expected)
}

function Invoke-ApiJson {
  param(
    [string]$Uri,
    [hashtable]$Body,
    [string]$ApiKey
  )

  $headers = @{ Authorization = "Bearer $ApiKey" }
  $payload = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Uri $Uri -Method Post -Headers $headers -ContentType "application/json" -Body $payload
}

function Get-ReadinessProbeUrl {
  param($Config)

  if ($Config.provider -eq "ollama") {
    return "http://127.0.0.1:11434/api/version"
  }

  return $Config.baseUrl
}

function Assert-ArrayLengthAtMost {
  param(
    [string]$Name,
    $Value,
    [int]$Max
  )

  if (-not ($Value -is [System.Array])) {
    Add-Failure "$Name must be an array."
    return
  }

  if ($Value.Count -gt $Max) {
    Add-Failure "$Name exceeds max length $Max."
    return
  }

  Add-Pass "$Name length is within limit."
}

function Test-LocalGpuProfileSelection {
  $matrixPath = Join-Path $PSScriptRoot "local-gpu-profile-matrix.json"
  $matrix = Get-LocalGpuProfileMatrix -MatrixPath $matrixPath

  $autoSmall = Resolve-LocalGpuProfileSelection -Matrix $matrix -RequestedProfile "local-gpu-small" -DetectedVramGb 10
  Assert-Equal -Name "autoSmall.status" -Actual $autoSmall.status -Expected "selected"
  Assert-Equal -Name "autoSmall.profileId" -Actual $autoSmall.profileId -Expected "local-gpu-8gb"
  Assert-Equal -Name "autoSmall.selectionSource" -Actual $autoSmall.selectionSource -Expected "detected-vram"

  $autoLarge = Resolve-LocalGpuProfileSelection -Matrix $matrix -RequestedProfile "local-gpu-large" -DetectedVramGb 12
  Assert-Equal -Name "autoLarge.status" -Actual $autoLarge.status -Expected "selected"
  Assert-Equal -Name "autoLarge.profileId" -Actual $autoLarge.profileId -Expected "local-gpu-12gb"
  Assert-Equal -Name "autoLarge.selectionSource" -Actual $autoLarge.selectionSource -Expected "detected-vram"

  $manualProfile = Resolve-LocalGpuProfileSelection -Matrix $matrix -RequestedProfile "local-gpu-small" -ManualProfileId "local-gpu-20gb-plus" -DetectedVramGb 8
  Assert-Equal -Name "manualProfile.status" -Actual $manualProfile.status -Expected "selected"
  Assert-Equal -Name "manualProfile.profileId" -Actual $manualProfile.profileId -Expected "local-gpu-20gb-plus"
  Assert-Equal -Name "manualProfile.selectionSource" -Actual $manualProfile.selectionSource -Expected "manual-profile"

  $manualVram = Resolve-LocalGpuProfileSelection -Matrix $matrix -RequestedProfile "local-gpu-small" -ManualVramGb 21
  Assert-Equal -Name "manualVram.status" -Actual $manualVram.status -Expected "selected"
  Assert-Equal -Name "manualVram.profileId" -Actual $manualVram.profileId -Expected "local-gpu-20gb-plus"
  Assert-Equal -Name "manualVram.selectionSource" -Actual $manualVram.selectionSource -Expected "manual-vram"

  $unsupported = Resolve-LocalGpuProfileSelection -Matrix $matrix -RequestedProfile "local-gpu-small" -DetectedVramGb 6
  Assert-Equal -Name "unsupported.status" -Actual $unsupported.status -Expected "manual-selection-required"
  Assert-Equal -Name "unsupported.selectionSource" -Actual $unsupported.selectionSource -Expected "unsupported-vram"
  Assert-Equal -Name "unsupported.profileId" -Actual $unsupported.profileId -Expected $null

  $unknown = Resolve-LocalGpuProfileSelection -Matrix $matrix -RequestedProfile "local-gpu-large"
  Assert-Equal -Name "unknown.status" -Actual $unknown.status -Expected "manual-selection-required"
  Assert-Equal -Name "unknown.selectionSource" -Actual $unknown.selectionSource -Expected "detection-unavailable"
  Assert-Equal -Name "unknown.profileId" -Actual $unknown.profileId -Expected $null
}

function Test-Embeddings {
  param($Config)

  $response = Invoke-ApiJson -Uri "$($Config.baseUrl)/embeddings" -ApiKey $Config.apiKey -Body @{
    model = $Config.embeddingModel
    input = "lantern market rooftop at dusk"
    encoding_format = "float"
  }

  if (-not $response.data -or -not $response.data[0].embedding) {
    Add-Failure "Embeddings response did not include an embedding vector."
    return
  }

  $embeddingLength = $response.data[0].embedding.Length
  if ($embeddingLength -le 0) {
    Add-Failure "Embeddings response returned an empty vector."
    return
  }

  Add-Pass "Embeddings endpoint returned a vector of length $embeddingLength."
}

function Test-SceneSchema {
  param($Config)

  $response = Invoke-ApiJson -Uri "$($Config.baseUrl)/chat/completions" -ApiKey $Config.apiKey -Body @{
    model = $Config.chatModel
    temperature = 0
    messages = @(
      @{ role = "system"; content = "Return only valid JSON that matches the schema." },
      @{ role = "user"; content = "Describe a torch-lit alley in one sentence." }
    )
    response_format = @{
      type = "json_schema"
      json_schema = @{
        name = "scene"
        strict = $true
        schema = @{
          type = "object"
          additionalProperties = $false
          properties = @{
            narrative = @{ type = "string" }
          }
          required = @("narrative")
        }
      }
    }
  }

  $content = $response.choices[0].message.content
  $parsed = $content | ConvertFrom-Json
  if (-not $parsed.narrative) {
    Add-Failure "Scene schema response did not include narrative."
    return
  }

  Add-Pass "Structured scene response parsed successfully."
}

function Test-TurnSchemaGuardrails {
  Push-Location $repoRoot
  try {
    $output = & docker compose run --rm --no-deps app npx tsx scripts/validate-turn-schema.ts 2>&1
    if ($LASTEXITCODE -ne 0) {
      Add-Failure ("Turn schema guardrail check failed: {0}" -f (($output | ForEach-Object { "$_" }) -join " "))
      return
    }

    Add-Pass "Turn schema guardrail check passed."
  } finally {
    Pop-Location
  }
}

function Test-GameTurnSchema {
  param($Config)

  $statePackJson = '{"player":{"id":"test-player","name":"Wanderer","location":"Rooftop Market","inventory":[],"flags":[],"quests":[]},"summary":"","director":{"end_goal_progress":"Just beginning."},"director_spec":{"end_goal":"Recover the moon shard.","current_beat":{"id":"beat_1","label":"Hear the rumor"},"rules":["Keep the story moving."]},"quest_spec":{"quests":[]}}'
  $prompt = @"
STATE_PACK
$statePackJson

SHORT_HISTORY
PLAYER: look around

MEMORIES

PLAYER_INPUT
look around
"@

  $response = Invoke-ApiJson -Uri "$($Config.baseUrl)/chat/completions" -ApiKey $Config.apiKey -Body @{
    model = $Config.chatModel
    temperature = 0.2
    messages = @(
      @{ role = "system"; content = "You are the Narrative Engine for a text-based adventure game. Return structured JSON only." },
      @{ role = "user"; content = $prompt }
    )
    response_format = @{
      type = "json_schema"
      json_schema = @{
        name = "game_turn"
        strict = $true
        schema = @{
          type = "object"
          additionalProperties = $false
          properties = @{
            narrative = @{ type = "string" }
            player_options = @{
              type = "array"
              items = @{ type = "string" }
              minItems = 0
              maxItems = 6
            }
            state_updates = @{
              type = "object"
              additionalProperties = $false
              properties = @{
                location = @{ type = "string" }
                inventory_add = @{ type = "array"; items = @{ type = "string" } }
                inventory_remove = @{ type = "array"; items = @{ type = "string" } }
                flags_add = @{ type = "array"; items = @{ type = "string" } }
                flags_remove = @{ type = "array"; items = @{ type = "string" } }
                quests = @{
                  type = "array"
                  items = @{
                    type = "object"
                    additionalProperties = $false
                    properties = @{
                      id = @{ type = "string" }
                      status = @{ type = "string" }
                      summary = @{ type = "string" }
                    }
                    required = @("id", "status", "summary")
                  }
                }
              }
              required = @("location", "inventory_add", "inventory_remove", "flags_add", "flags_remove", "quests")
            }
            director_updates = @{
              type = "object"
              additionalProperties = $false
              properties = @{
                end_goal_progress = @{ type = "string" }
              }
              required = @("end_goal_progress")
            }
            memory_updates = @{
              type = "array"
              items = @{ type = "string" }
              minItems = 0
              maxItems = 8
            }
          }
          required = @("narrative", "player_options", "state_updates", "director_updates", "memory_updates")
        }
      }
    }
  }

  $content = $response.choices[0].message.content
  $parsed = $content | ConvertFrom-Json

  if (-not $parsed.narrative) {
    Add-Failure "Game turn response did not include narrative."
    return
  }

  if (-not $parsed.state_updates.location) {
    Add-Failure "Game turn response did not include state_updates.location."
    return
  }

  if (-not $parsed.director_updates.end_goal_progress) {
    Add-Failure "Game turn response did not include director_updates.end_goal_progress."
    return
  }

  Assert-ArrayLengthAtMost -Name "player_options" -Value $parsed.player_options -Max 6
  Assert-ArrayLengthAtMost -Name "memory_updates" -Value $parsed.memory_updates -Max 8
  Add-Pass "Full game_turn response parsed successfully."
}

$dotEnv = Import-DotEnvIntoSession -Path (Join-Path $repoRoot ".env")
$config = Resolve-RepoAiConfig -DotEnv $dotEnv

Write-Host "Running local AI workflow regression harness" -ForegroundColor Cyan
Write-Host ("Provider: {0}" -f $config.provider)
Write-Host ("Base URL: {0}" -f $config.baseUrl)
Write-Host ("Chat model: {0}" -f $config.chatModel)
Write-Host ("Embedding model: {0}" -f $config.embeddingModel)

try {
  Test-LocalGpuProfileSelection
} catch {
  Add-Failure ("Local GPU profile selection test failed: {0}" -f $_.Exception.Message)
}

try {
  Test-TurnSchemaGuardrails
} catch {
  Add-Failure ("Turn schema guardrail test failed: {0}" -f $_.Exception.Message)
}

if ($SelectionOnly) {
  if ($script:Failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Local AI workflow regression harness failed." -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host (" - {0}" -f $_) -ForegroundColor Red }
    exit 1
  }

  Write-Host ""
  Write-Host "Local AI workflow regression harness passed." -ForegroundColor Green
  exit 0
}

if ([string]::IsNullOrWhiteSpace($config.baseUrl)) {
  Add-Failure "This harness needs a reachable AI base URL from the current provider config."
}

$probeUrl = Get-ReadinessProbeUrl -Config $config
if (-not (Wait-ForHttpReady -Uri $probeUrl -TimeoutSeconds 5)) {
  Add-Failure ("Configured AI base URL did not respond before tests started: {0}" -f $probeUrl)
}

try {
  Test-Embeddings -Config $config
} catch {
  Add-Failure ("Embeddings test failed: {0}" -f $_.Exception.Message)
}

try {
  Test-SceneSchema -Config $config
} catch {
  Add-Failure ("Structured scene test failed: {0}" -f $_.Exception.Message)
}

try {
  Test-GameTurnSchema -Config $config
} catch {
  Add-Failure ("Full game_turn test failed: {0}" -f $_.Exception.Message)
}

if ($script:Failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Local AI workflow regression harness failed." -ForegroundColor Red
  $script:Failures | ForEach-Object { Write-Host (" - {0}" -f $_) -ForegroundColor Red }
  exit 1
}

Write-Host ""
Write-Host "Local AI workflow regression harness passed." -ForegroundColor Green
