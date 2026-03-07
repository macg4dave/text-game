$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

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

function Load-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
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

    if (-not [string]::IsNullOrWhiteSpace($key) -and -not (Test-Path "Env:$key")) {
      Set-Item -Path "Env:$key" -Value $value
    }
  }
}

function Get-Config {
  param([string]$RepoRoot)

  Load-DotEnv -Path (Join-Path $RepoRoot ".env")

  $provider = if ($env:AI_PROVIDER) { $env:AI_PROVIDER.Trim().ToLowerInvariant() } else { "ollama" }
  $baseUrl = if ($env:OLLAMA_BASE_URL) {
    $env:OLLAMA_BASE_URL.Trim()
  } elseif ($env:AI_BASE_URL) {
    $env:AI_BASE_URL.Trim()
  } else {
    "http://127.0.0.1:11434/v1"
  }

  $apiKey = if ($env:OLLAMA_API_KEY) {
    $env:OLLAMA_API_KEY.Trim()
  } elseif ($env:AI_API_KEY) {
    $env:AI_API_KEY.Trim()
  } else {
    "ollama"
  }

  $chatModel = if ($env:OLLAMA_CHAT_MODEL) {
    $env:OLLAMA_CHAT_MODEL.Trim()
  } elseif ($env:AI_CHAT_MODEL) {
    $env:AI_CHAT_MODEL.Trim()
  } else {
    "gemma3:4b"
  }

  $embeddingModel = if ($env:OLLAMA_EMBEDDING_MODEL) {
    $env:OLLAMA_EMBEDDING_MODEL.Trim()
  } elseif ($env:AI_EMBEDDING_MODEL) {
    $env:AI_EMBEDDING_MODEL.Trim()
  } else {
    "embeddinggemma"
  }

  return [ordered]@{
    provider = $provider
    baseUrl = $baseUrl.TrimEnd("/")
    apiKey = $apiKey
    chatModel = $chatModel
    embeddingModel = $embeddingModel
  }
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Config -RepoRoot $repoRoot

Write-Host "Running local AI workflow regression harness" -ForegroundColor Cyan
Write-Host ("Provider: {0}" -f $config.provider)
Write-Host ("Base URL: {0}" -f $config.baseUrl)
Write-Host ("Chat model: {0}" -f $config.chatModel)
Write-Host ("Embedding model: {0}" -f $config.embeddingModel)

if ($config.provider -ne "ollama" -and -not $env:AI_BASE_URL -and -not $env:OLLAMA_BASE_URL) {
  Add-Failure "This harness expects Ollama defaults or an explicit OpenAI-compatible base URL."
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
