param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Write-Step {
  param([string]$Message)

  Write-Host "==> $Message" -ForegroundColor Cyan
}

Write-Step "Building the app image so Docker test runs see the latest UI harness files"
docker compose build app
if ($LASTEXITCODE -ne 0) {
  throw "docker compose build app failed."
}

Write-Step "Running TypeScript type-check for the browser smoke harness"
docker compose run --rm --no-deps app npm run type-check
if ($LASTEXITCODE -ne 0) {
  throw "Type-check failed."
}

Write-Step "Running the targeted setup browser smoke tests"
docker compose run --rm --no-deps app npx tsx --test src/ui/setup-view.test.ts src/ui/launch-view.test.ts src/ui/setup-browser-smoke.test.ts
if ($LASTEXITCODE -ne 0) {
  throw "Setup browser smoke tests failed."
}

Write-Step "Rebuilding the browser bundle to confirm the current UI still compiles"
docker compose run --rm --no-deps app npm run build:client
if ($LASTEXITCODE -ne 0) {
  throw "Browser build failed."
}

Write-Host ""
Write-Host "Setup browser smoke path passed." -ForegroundColor Green