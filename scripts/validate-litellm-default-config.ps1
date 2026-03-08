$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "litellm.config.yaml"
$content = Get-Content -LiteralPath $configPath -Raw

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

if ($content -match [regex]::Escape("model: ollama_chat/gemma3:4b")) {
  Add-Pass "Default chat alias routes to host Ollama gemma3:4b."
} else {
  Add-Failure "Default chat alias must route to ollama_chat/gemma3:4b."
}

if ($content -match [regex]::Escape("model: ollama/embeddinggemma")) {
  Add-Pass "Default embedding alias routes to host Ollama embeddinggemma."
} else {
  Add-Failure "Default embedding alias must route to ollama/embeddinggemma."
}

if ($content -match [regex]::Escape("api_base: os.environ/OLLAMA_BASE_URL")) {
  Add-Pass "Default LiteLLM config uses OLLAMA_BASE_URL for Ollama routing."
} else {
  Add-Failure "Default LiteLLM config must use api_base: os.environ/OLLAMA_BASE_URL."
}

if ($script:Failures.Count -gt 0) {
  Write-Host ""
  Write-Host "LiteLLM default config validation failed." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "LiteLLM default config validation passed." -ForegroundColor Green
