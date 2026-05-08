[CmdletBinding()]
param(
  [string]$OutputDir = ".\out"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir
} else {
  Join-Path $scriptDir $OutputDir
}

if (-not (Test-Path -LiteralPath $resolvedOutputDir)) {
  New-Item -Path $resolvedOutputDir -ItemType Directory -Force | Out-Null
}

$manifest = Get-Content -Raw (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
$version = $manifest.version
$zipName = "bizgital-insight-capture-bridge-v$version-devmode.zip"
$zipPath = Join-Path $resolvedOutputDir $zipName

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$tempDir = Join-Path $env:TEMP ("insight-capture-bridge-" + [guid]::NewGuid().ToString("N"))
New-Item -Path $tempDir -ItemType Directory -Force | Out-Null

$excludeNames = @('.git', '.DS_Store')
Get-ChildItem -LiteralPath $extensionRoot -Force |
  Where-Object { $excludeNames -notcontains $_.Name } |
  ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $tempDir $_.Name) -Recurse -Force
  }

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $tempDir -Recurse -Force

Write-Host "Created: $zipPath" -ForegroundColor Green
