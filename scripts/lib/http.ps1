function Test-HttpReady {
  param(
    [string]$Uri,
    [int]$TimeoutSeconds = 3,
    [string]$ExpectedContent = ""
  )

  try {
    $response = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec $TimeoutSeconds -UseBasicParsing
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
      return $false
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpectedContent) -and ($response.Content -notlike "*$ExpectedContent*")) {
      return $false
    }

    return $true
  } catch {
    return $false
  }
}

function Wait-ForHttpReady {
  param(
    [string]$Uri,
    [int]$TimeoutSeconds = 60,
    [int]$PollMilliseconds = 1000,
    [string]$ExpectedContent = ""
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady -Uri $Uri -TimeoutSeconds $TimeoutSeconds -ExpectedContent $ExpectedContent) {
      return $true
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return $false
}
