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
