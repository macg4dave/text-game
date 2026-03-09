Set-StrictMode -Version Latest

$launcherModules = @(
  "launcher-output.ps1",
  "launcher-host.ps1",
  "launcher-runtime.ps1"
)

foreach ($moduleFile in $launcherModules) {
  . (Join-Path $PSScriptRoot $moduleFile)
}
