$ErrorActionPreference = "Stop"

function Wait-ForCondition {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Condition,
    [Parameter(Mandatory = $true)][string]$FailureMessage,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw $FailureMessage
}

$installer = Get-ChildItem -Path (Join-Path $PSScriptRoot "..\release") `
  -Filter "AgentPup-Setup-*.exe" | Select-Object -First 1
if ($null -eq $installer) {
  throw "The AgentPup NSIS installer was not found."
}

$installRoot = Join-Path $env:RUNNER_TEMP "AgentPup-clean-install"
$appPath = Join-Path $installRoot "AgentPup.exe"

Write-Host "Installing $($installer.Name) into a fresh temporary directory."
$install = Start-Process -FilePath $installer.FullName -ArgumentList @(
  "/S",
  "/D=$installRoot"
) -Wait -PassThru
if ($install.ExitCode -ne 0) {
  throw "The installer exited with code $($install.ExitCode)."
}
Wait-ForCondition -Condition { Test-Path $appPath -PathType Leaf } `
  -FailureMessage "The installed AgentPup executable did not appear."

Write-Host "Launching the installed application."
$app = Start-Process -FilePath $appPath -ArgumentList "--demo" -PassThru
Start-Sleep -Seconds 8
if ($app.HasExited) {
  throw "The installed application exited during its launch smoke test with code $($app.ExitCode)."
}

& taskkill.exe /PID $app.Id /T /F | Out-Host
Wait-ForCondition -Condition { $app.HasExited } `
  -FailureMessage "The installed application did not stop after the launch smoke test."

$uninstaller = Get-ChildItem -Path $installRoot -Filter "Uninstall*.exe" |
  Select-Object -First 1
if ($null -eq $uninstaller) {
  throw "The NSIS uninstaller was not created."
}

Write-Host "Uninstalling the temporary installation."
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -PassThru
if ($uninstall.ExitCode -ne 0) {
  throw "The uninstaller exited with code $($uninstall.ExitCode)."
}
Wait-ForCondition -Condition { -not (Test-Path $appPath) } `
  -FailureMessage "AgentPup.exe remained after uninstall."

Write-Host "Clean Windows install, launch, and uninstall smoke test passed."
