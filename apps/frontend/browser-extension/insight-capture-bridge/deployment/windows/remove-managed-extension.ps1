[CmdletBinding()]
param(
  [ValidateSet('Chrome', 'Edge', 'Both')]
  [string]$Browser = 'Both'
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

function Remove-PolicyValues {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  Get-ItemProperty -Path $Path | ForEach-Object {
    $_.PSObject.Properties |
      Where-Object { $_.Name -match '^\d+$' } |
      ForEach-Object {
        Remove-ItemProperty -Path $Path -Name $_.Name -ErrorAction SilentlyContinue
      }
  }
}

function Remove-ExtensionSettingsValue {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  Remove-ItemProperty -Path $Path -Name 'ExtensionSettings' -ErrorAction SilentlyContinue
}

Assert-Admin

if ($Browser -in @('Chrome', 'Both')) {
  Remove-PolicyValues -Path 'HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist'
  Remove-ExtensionSettingsValue -Path 'HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionSettings'
}

if ($Browser -in @('Edge', 'Both')) {
  Remove-PolicyValues -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist'
  Remove-ExtensionSettingsValue -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionSettings'
}

Write-Host 'Managed extension policy values removed.' -ForegroundColor Yellow
Write-Host 'Restart browser and verify in chrome://policy or edge://policy.'
