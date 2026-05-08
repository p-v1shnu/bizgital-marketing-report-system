[CmdletBinding()]
param(
  [string]$ExtensionRoot = "..\..",
  [Parameter(Mandatory = $true)]
  [string]$PrivateKeyPath,
  [string]$ChromeExePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-ChromePath {
  param([string]$ExplicitPath)
  if ($ExplicitPath) {
    if (Test-Path -LiteralPath $ExplicitPath) {
      return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }
    throw "Chrome executable not found at: $ExplicitPath"
  }

  $candidates = @(
    "$Env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$Env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$Env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$Env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw 'Could not find Chrome/Edge executable automatically. Pass -ChromeExePath.'
}

$rootPath = (Resolve-Path -LiteralPath $ExtensionRoot).Path
$keyPath = (Resolve-Path -LiteralPath $PrivateKeyPath).Path
$browserPath = Resolve-ChromePath -ExplicitPath $ChromeExePath

$args = @(
  "--pack-extension=$rootPath",
  "--pack-extension-key=$keyPath"
)

Write-Host "Packing extension from: $rootPath"
Write-Host "Using key:             $keyPath"
Write-Host "Using browser binary:  $browserPath"

$process = Start-Process -FilePath $browserPath -ArgumentList $args -PassThru -Wait -WindowStyle Hidden
if ($process.ExitCode -ne 0) {
  throw "Pack command failed with exit code $($process.ExitCode)."
}

Write-Host 'Pack command completed. Check extension root for .crx output.' -ForegroundColor Green
