[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [Parameter(Mandatory = $true)]
  [string]$CrxCodebaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$OutputPath = ".\update.xml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($ExtensionId -notmatch '^[a-z]{32}$') {
  throw "ExtensionId must be 32 lowercase letters. Got: $ExtensionId"
}

try {
  $codebase = [Uri]$CrxCodebaseUrl
} catch {
  throw "Invalid CrxCodebaseUrl: $CrxCodebaseUrl"
}

if ($codebase.Scheme -ne 'https') {
  throw "CrxCodebaseUrl must use HTTPS. Got: $CrxCodebaseUrl"
}

$xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="$ExtensionId">
    <updatecheck codebase="$CrxCodebaseUrl" version="$Version" />
  </app>
</gupdate>
"@

$resolved = Resolve-Path -LiteralPath "." | Select-Object -ExpandProperty Path
$destination = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path $resolved $OutputPath
}

$directory = Split-Path -Path $destination -Parent
if ($directory -and -not (Test-Path -LiteralPath $directory)) {
  New-Item -Path $directory -ItemType Directory -Force | Out-Null
}

[System.IO.File]::WriteAllText($destination, $xml, [System.Text.Encoding]::UTF8)
Write-Host "update.xml generated: $destination" -ForegroundColor Green
