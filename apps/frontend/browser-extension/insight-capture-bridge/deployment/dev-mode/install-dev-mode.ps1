[CmdletBinding()]
param(
  [ValidateSet('Chrome', 'Edge', 'Both')]
  [string]$Browser = 'Both',

  [string]$TargetDir = "$env:LOCALAPPDATA\BIZGITAL\InsightCaptureBridge"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-ExtensionRoot {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  # deployment/dev-mode -> extension root (../..)
  return (Resolve-Path (Join-Path $scriptDir "..\..")).Path
}

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -Path $Path -ItemType Directory -Force | Out-Null
  }
}

function Copy-ExtensionFiles {
  param(
    [string]$SourceRoot,
    [string]$DestinationRoot
  )

  Ensure-Directory -Path $DestinationRoot

  # Remove previous version to avoid stale files.
  Get-ChildItem -LiteralPath $DestinationRoot -Force -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  $excludeNames = @('.git', '.DS_Store')
  Get-ChildItem -LiteralPath $SourceRoot -Force |
    Where-Object { $excludeNames -notcontains $_.Name } |
    ForEach-Object {
      $dest = Join-Path $DestinationRoot $_.Name
      Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
    }
}

function Open-ExtensionsPage {
  param([string]$BrowserName)
  switch ($BrowserName) {
    'Chrome' { Start-Process 'chrome://extensions' | Out-Null }
    'Edge' { Start-Process 'edge://extensions' | Out-Null }
  }
}

$sourceRoot = Resolve-ExtensionRoot
Copy-ExtensionFiles -SourceRoot $sourceRoot -DestinationRoot $TargetDir

if ($Browser -in @('Chrome', 'Both')) {
  Open-ExtensionsPage -BrowserName 'Chrome'
}
if ($Browser -in @('Edge', 'Both')) {
  Open-ExtensionsPage -BrowserName 'Edge'
}

Write-Host 'Extension files installed for Developer Mode.' -ForegroundColor Green
Write-Host "Extension folder: $TargetDir"
Write-Host ''
Write-Host 'Next steps (per browser):'
Write-Host '1) Open extensions page'
Write-Host '2) Enable Developer mode'
Write-Host '3) Click "Load unpacked"'
Write-Host "4) Select folder: $TargetDir"
