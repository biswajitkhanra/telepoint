#Requires -Version 5.1
<#
  Build BOTH TelePoint Android apps on EAS (customer + retailer).
  Run this yourself after `eas login` — it drives cloud builds under your Expo
  account, which cannot be automated for you.

  Usage (from repo root or anywhere):
    .\scripts\build-apps.ps1
    .\scripts\build-apps.ps1 -Profile customer    # just one
#>
[CmdletBinding()]
param(
  [ValidateSet('both', 'customer', 'retailer')] [string] $Profile = 'both'
)
$ErrorActionPreference = 'Stop'

$mobile = Join-Path $PSScriptRoot '..\mobile'
if (-not (Test-Path (Join-Path $mobile 'app.json'))) { throw "mobile/ not found next to scripts/." }
Set-Location $mobile

if (-not (Get-Command eas -ErrorAction SilentlyContinue)) {
  throw "eas-cli not found. Install: npm i -g eas-cli ; then: eas login"
}

Write-Host "> npm install" -ForegroundColor Cyan
npm install

$profiles = if ($Profile -eq 'both') { @('customer', 'retailer') } else { @($Profile) }
foreach ($p in $profiles) {
  Write-Host "`n> eas build -p android --profile $p" -ForegroundColor Cyan
  eas build -p android --profile $p
}

Write-Host "`nDone. Download the APK(s) from the EAS build page(s)." -ForegroundColor Green
Write-Host "Next: host the customer APK, get its SHA-256 (eas credentials), then generate the" -ForegroundColor DarkGray
Write-Host "provisioning QR at <portal>/admin/provision." -ForegroundColor DarkGray
