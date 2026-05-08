[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string]$Profile,

  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$sharedManifestPath = Join-Path $extensionRoot "manifest.shared.json"
$profileManifestPath = Join-Path $extensionRoot ("manifest.profiles\{0}.json" -f $Profile)

if (-not (Test-Path -LiteralPath $sharedManifestPath)) {
  throw "Shared manifest not found: $sharedManifestPath"
}
if (-not (Test-Path -LiteralPath $profileManifestPath)) {
  throw "Profile manifest not found: $profileManifestPath"
}

$sharedManifest = Get-Content -Raw -LiteralPath $sharedManifestPath | ConvertFrom-Json
$profileManifest = Get-Content -Raw -LiteralPath $profileManifestPath | ConvertFrom-Json

if (-not $sharedManifest.content_scripts -or $sharedManifest.content_scripts.Count -eq 0) {
  throw "manifest.shared.json must contain at least one content_scripts entry."
}

$sharedManifest.host_permissions = @($profileManifest.host_permissions)
$sharedManifest.content_scripts[0].matches = @($profileManifest.content_script_matches)

$resolvedOutputPath = if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  Join-Path $extensionRoot "manifest.json"
} elseif ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path $scriptDir $OutputPath
}

$outputDir = Split-Path -Parent $resolvedOutputPath
if ($outputDir -and -not (Test-Path -LiteralPath $outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$sharedManifest | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $resolvedOutputPath -Encoding utf8

Write-Host "Created manifest ($Profile): $resolvedOutputPath" -ForegroundColor Green
