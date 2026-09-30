#Requires -Version 5.1
<#
  TelePoint — Device Owner provisioning over WIRELESS DEBUGGING (no cable).

  This runs on the OPERATOR'S PC (the ADB host). It automates the host side of
  the flow — pair, connect, set-device-owner, verify. It does NOT (and cannot)
  let the phone provision itself: `dpm set-device-owner` is granted by ADB from
  here, which is the only legitimate no-cable path besides QR/zero-touch.

  PRECONDITIONS on the phone (Device Owner will FAIL otherwise):
    - Freshly factory-reset, OR a device with NO Google/other accounts added.
    - The TelePoint customer APK installed.
    - Developer options > Wireless debugging = ON.

  USAGE:
    .\provision-device-owner.ps1
    .\provision-device-owner.ps1 -Apk "D:\path\telepoint-customer.apk"
    .\provision-device-owner.ps1 -Unprovision   # remove Device Owner (loan closed / testing)
#>
[CmdletBinding()]
param(
  [string] $Package = "com.telepoint.customer",
  [string] $AdminReceiver = "com.telepoint.devicemanagement.TelepointDeviceAdminReceiver",
  [string] $Apk = "",
  [switch] $Unprovision
)

$ErrorActionPreference = "Stop"
$Component = "$Package/$AdminReceiver"

function Find-Adb {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", "$env:ANDROID_HOME\platform-tools\adb.exe", "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  throw "adb not found. Install Android platform-tools (https://developer.android.com/tools/releases/platform-tools) and add it to PATH."
}

function Invoke-Adb { param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Args)
  & $script:Adb @Args 2>&1
}

$script:Adb = Find-Adb
Write-Host "adb: $script:Adb" -ForegroundColor DarkGray

if ($Unprovision) {
  Write-Host "`n== Removing Device Owner (release) ==" -ForegroundColor Cyan
  Write-Host "Note: the app releases everything automatically when the loan is marked COMPLETE/SETTLED." -ForegroundColor DarkGray
  $host1 = Read-Host "Phone 'IP:port' from Wireless debugging (connect port)"
  Invoke-Adb connect $host1 | Write-Host
  Write-Host (Invoke-Adb shell dpm remove-active-admin $Component)
  Write-Host "If that failed, the app clears Device Owner itself on loan closure. Done." -ForegroundColor Green
  return
}

Write-Host @"

============================================================
 TelePoint — Device Owner provisioning (wireless)
============================================================
On the PHONE:
  1. Settings > About phone > tap 'Build number' 7x (enable Developer options)
  2. Developer options > Wireless debugging = ON
  3. Tap 'Pair device with pairing code'  (a code + an IP:PORT appear)
  IMPORTANT: no Google/other account may be added yet, or provisioning fails.
------------------------------------------------------------
"@ -ForegroundColor Cyan

# --- Pair -------------------------------------------------------------------
$pairHostPort = Read-Host "PAIRING 'IP:PORT' (from the 'Pair device with pairing code' dialog)"
$pairCode     = Read-Host "6-digit PAIRING CODE"
Write-Host "> pairing..." -ForegroundColor DarkGray
$pairOut = & $script:Adb pair $pairHostPort $pairCode 2>&1
Write-Host $pairOut
if ($pairOut -notmatch "Successfully paired") {
  throw "Pairing failed. Re-open the pairing dialog (the code + port change each time) and retry."
}

# --- Connect ----------------------------------------------------------------
Write-Host "`nOn the Wireless debugging MAIN screen there is a DIFFERENT 'IP address & Port' (the connect port, not the pairing port)." -ForegroundColor Yellow
$connHostPort = Read-Host "CONNECT 'IP:PORT' (Wireless debugging main screen)"
Write-Host "> connecting..." -ForegroundColor DarkGray
$connOut = & $script:Adb connect $connHostPort 2>&1
Write-Host $connOut
if ($connOut -notmatch "connected to") {
  throw "Connect failed. Check the IP:PORT and that the phone + PC are on the same Wi-Fi."
}

# --- Ensure the APK is installed -------------------------------------------
$pkgList = & $script:Adb -s $connHostPort shell pm list packages $Package 2>&1
if ($pkgList -notmatch [Regex]::Escape($Package)) {
  if ($Apk -and (Test-Path $Apk)) {
    Write-Host "> installing $Apk ..." -ForegroundColor DarkGray
    Write-Host (& $script:Adb -s $connHostPort install -r $Apk 2>&1)
  } else {
    throw "$Package is not installed on the phone. Install the TelePoint customer APK first, or pass -Apk <path>."
  }
} else {
  Write-Host "$Package is installed." -ForegroundColor DarkGray
}

# --- Set Device Owner -------------------------------------------------------
Write-Host "`n> setting Device Owner..." -ForegroundColor DarkGray
$owfrom = & $script:Adb -s $connHostPort shell dpm set-device-owner $Component 2>&1
Write-Host $owout
Write-Host $owfrom
if ("$owfrom" -match "Success") {
  Write-Host "`nOK  Device Owner set. Open the TelePoint app once — it will apply protection and grant its own runtime permissions." -ForegroundColor Green
} else {
  Write-Host "`nx  set-device-owner did not report Success." -ForegroundColor Red
  Write-Host "Most common cause: an account already exists on the device, or a device owner/profile is already set." -ForegroundColor Yellow
  Write-Host "Fix: remove ALL accounts (Settings > Passwords & accounts) or factory-reset, then run this again." -ForegroundColor Yellow
}

# --- Verify -----------------------------------------------------------------
Write-Host "`n== Verify ==" -ForegroundColor Cyan
Write-Host (& $script:Adb -s $connHostPort shell dpm list-owners 2>&1)
