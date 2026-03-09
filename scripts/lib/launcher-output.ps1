function Write-Step {
  param([string]$Message)

  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Message)

  Write-Host "    $Message" -ForegroundColor DarkGray
}

function Fail {
  param([string]$Message)

  throw $Message
}

function New-PreflightIssue {
  param(
    [ValidateSet("blocker", "warning", "info")]
    [string]$Severity,
    [ValidateSet("config", "ai", "host", "storage")]
    [string]$Area,
    [string]$Code,
    [string]$Title,
    [string]$Message,
    [string[]]$Recovery = @(),
    [string[]]$EnvVars = @(),
    [hashtable]$Details = @{}
  )

  return [pscustomobject]@{
    code = $Code
    severity = $Severity
    area = $Area
    title = $Title
    message = $Message
    recovery = @($Recovery)
    recommended_fix = if ($Recovery.Count -gt 0) { $Recovery[0] } else { $null }
    env_vars = @($EnvVars)
    details = if ($Details.Count -gt 0) { $Details } else { $null }
  }
}

function Get-PreflightColor {
  param([string]$Severity)

  switch ($Severity) {
    "blocker" { return "Red" }
    "warning" { return "Yellow" }
    default { return "DarkCyan" }
  }
}

function Format-PreflightIssue {
  param($Issue)

  $lines = @(
    ("[{0}] {1}" -f $Issue.severity.ToUpperInvariant(), $Issue.title),
    $Issue.message
  )

  if (-not [string]::IsNullOrWhiteSpace($Issue.recommended_fix)) {
    $lines += ("Recommended next step: {0}" -f $Issue.recommended_fix)
  }

  if ($Issue.env_vars -and $Issue.env_vars.Count -gt 0) {
    $lines += ("Env vars: {0}" -f ($Issue.env_vars -join ", "))
  }

  if ($Issue.details) {
    $lines += "Advanced details:"
    $lines += ($Issue.details | ConvertTo-Json -Depth 6)
  }

  return $lines -join [Environment]::NewLine
}

function Show-PreflightIssues {
  param([object[]]$Issues)

  foreach ($issue in $Issues) {
    if ($null -eq $issue) {
      continue
    }

    Write-Host (Format-PreflightIssue -Issue $issue) -ForegroundColor (Get-PreflightColor -Severity $issue.severity)
    Write-Host ""
  }
}

function Fail-PreflightIssue {
  param($Issue)

  Fail (Format-PreflightIssue -Issue $Issue)
}
