[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [Parameter(Mandatory = $true)]
  [string]$UpdateManifestUrl,

  [ValidateSet('Chrome', 'Edge', 'Both')]
  [string]$Browser = 'Both',

  [switch]$UseExtensionSettingsOverride
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Please run this script as Administrator.'
  }
}

function Assert-ExtensionId {
  param([string]$Value)
  if ($Value -notmatch '^[a-z]{32}$') {
    throw "ExtensionId must be 32 lowercase letters. Got: $Value"
  }
}

function Assert-Url {
  param([string]$Value)
  try {
    $parsed = [Uri]$Value
  } catch {
    throw "Invalid URL: $Value"
  }
  if ($parsed.Scheme -ne 'https') {
    throw "UpdateManifestUrl must use HTTPS. Got: $Value"
  }
}

function Ensure-RegistryPath {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }
}

function Set-ForceListPolicy {
  param(
    [string]$RootPath,
    [string]$ExtensionId,
    [string]$UpdateUrl
  )
  Ensure-RegistryPath -Path $RootPath
  $value = "$ExtensionId;$UpdateUrl"
  New-ItemProperty -Path $RootPath -Name '1' -PropertyType String -Value $value -Force | Out-Null
}

function Set-ExtensionSettingsPolicy {
  param(
    [string]$RootPath,
    [string]$ExtensionId,
    [string]$UpdateUrl
  )
  Ensure-RegistryPath -Path $RootPath
  $json = @{
    $ExtensionId = @{
      installation_mode  = 'force_installed'
      update_url         = $UpdateUrl
      override_update_url = $true
    }
  } | ConvertTo-Json -Compress -Depth 5

  New-ItemProperty -Path $RootPath -Name 'ExtensionSettings' -PropertyType String -Value $json -Force | Out-Null
}

Assert-Admin
Assert-ExtensionId -Value $ExtensionId
Assert-Url -Value $UpdateManifestUrl

$targets = @()
if ($Browser -in @('Chrome', 'Both')) {
  $targets += @{
    Name = 'Chrome'
    ForceListPath = 'HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist'
    ExtensionSettingsPath = 'HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionSettings'
  }
}
if ($Browser -in @('Edge', 'Both')) {
  $targets += @{
    Name = 'Edge'
    ForceListPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist'
    ExtensionSettingsPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionSettings'
  }
}

foreach ($target in $targets) {
  Set-ForceListPolicy -RootPath $target.ForceListPath -ExtensionId $ExtensionId -UpdateUrl $UpdateManifestUrl
  if ($UseExtensionSettingsOverride) {
    Set-ExtensionSettingsPolicy -RootPath $target.ExtensionSettingsPath -ExtensionId $ExtensionId -UpdateUrl $UpdateManifestUrl
  }
}

Write-Host 'Managed extension policy applied successfully.' -ForegroundColor Green
Write-Host "ExtensionId: $ExtensionId"
Write-Host "Update URL:  $UpdateManifestUrl"
Write-Host "Browser:     $Browser"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '1) Restart Chrome/Edge'
Write-Host '2) Verify policy in chrome://policy and/or edge://policy'
