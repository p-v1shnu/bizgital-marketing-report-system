[CmdletBinding()]
param(
  [string]$OutputDir = ".\out"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$manifestBuilder = Join-Path $extensionRoot "deployment\build-manifest.ps1"
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir
} else {
  Join-Path $scriptDir $OutputDir
}

if (-not (Test-Path -LiteralPath $resolvedOutputDir)) {
  New-Item -Path $resolvedOutputDir -ItemType Directory -Force | Out-Null
}

$manifest = Get-Content -Raw (Join-Path $extensionRoot "manifest.shared.json") | ConvertFrom-Json
$version = $manifest.version
$zipName = "bizgital-insight-capture-bridge-v$version-devmode.zip"
$zipPath = Join-Path $resolvedOutputDir $zipName

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$tempDir = Join-Path $env:TEMP ("insight-capture-bridge-" + [guid]::NewGuid().ToString("N"))
New-Item -Path $tempDir -ItemType Directory -Force | Out-Null

$packageEntries = @(
  'background.js',
  'content-bridge.js',
  'icons',
  'options.html',
  'options.js',
  'popup.html',
  'popup.js',
  'README.md'
)

foreach ($entry in $packageEntries) {
  $source = Join-Path $extensionRoot $entry
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Package entry not found: $source"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $tempDir $entry) -Recurse -Force
}

& $manifestBuilder -Profile dev -OutputPath (Join-Path $tempDir "manifest.json") | Out-Null

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $tempDir -Recurse -Force

Write-Host "Created: $zipPath" -ForegroundColor Green
