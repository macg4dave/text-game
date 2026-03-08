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

if ([string]::IsNullOrWhiteSpace($config.baseUrl)) {
  Add-Failure "This harness needs a reachable AI base URL from the current provider config."
}

if (-not (Wait-ForHttpReady -Uri $config.baseUrl -TimeoutSeconds 5)) {
  Add-Failure ("Configured AI base URL did not respond before tests started: {0}" -f $config.baseUrl)
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
