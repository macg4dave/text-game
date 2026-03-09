function Format-ByteCount {
  param([double]$Bytes)

  if ($Bytes -ge 1GB) {
    return ("{0:N1} GB" -f ($Bytes / 1GB))
  }

  return ("{0:N0} MB" -f [Math]::Max(1, [Math]::Round($Bytes / 1MB)))
}

function Get-PathFreeSpaceBytes {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $null
  }

  try {
    $root = [System.IO.Path]::GetPathRoot($Path)
    if ([string]::IsNullOrWhiteSpace($root)) {
      return $null
    }

    $driveInfo = [System.IO.DriveInfo]::new($root)
    if (-not $driveInfo.IsReady) {
      return $null
    }

    return [double]$driveInfo.AvailableFreeSpace
  } catch {
    return $null
  }
}

function Test-DirectoryWritable {
  param([string]$Path)

  $probePath = $null
  try {
    if (-not (Test-Path -LiteralPath $Path)) {
      $null = New-Item -ItemType Directory -Path $Path -Force
    }

    $probePath = Join-Path $Path (".preflight-write-{0}-{1}.tmp" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    Set-Content -LiteralPath $probePath -Value "ok" -Encoding utf8
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue

    return [pscustomobject]@{
      ok = $true
      path = $Path
      error = $null
    }
  } catch {
    if ($probePath) {
      Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
    }

    return [pscustomobject]@{
      ok = $false
      path = $Path
      error = $_.Exception.Message
    }
  }
}
