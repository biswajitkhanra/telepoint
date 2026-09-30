# TelePoint — On-Device Wireless Provisioning & Advanced Security Master Specification
## Battle-Tested Architecture Plan (Arena-Hardened against OEM & OS Edge Cases)

This document is the definitive production guide, architecture blueprint, and execution checklist for TelePoint MDM. It incorporates adversarial attack-defense analysis (via `arena-skill` methodology) to ensure zero failure modes across Android 11 to 14, OEM skins (Xiaomi HyperOS/MIUI, Vivo Funtouch, Oppo ColorOS, Samsung OneUI), offline conditions, and customer tampering attempts.

---

### Key Production Parameters
- **Target FRP Google Account**: `financebuddy144@gmail.com` (Requires 21-digit Gaia ID extraction)
- **Target Emergency Alert Numbers**: Primary: `7003617029` | Backup: `7003617074`
- **Device Admin Component**: `com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver`
- **Provisioning Model**: On-Device Wireless Debugging (No PC / No Cable required at counter)
- **Offline Unlock Mechanism**: RFC 6238 TOTP (Google Authenticator compatible, 30-min window)

---

## 📋 Comprehensive Execution Checklist

```
================================================================================
PHASE 1: ON-DEVICE WIRELESS DEBUGGING PROVISIONING (NO PC / ZERO CABLE)
================================================================================
[ ] 1.1 Embedded local ADB client in mobile native module (`dadb` or `libadb` TLS engine)
[ ] 1.2 Android Notification Listener Service (`TelepointNotificationListener.kt`) to capture 
        the "Wireless debugging service started" system broadcast
[ ] 1.3 Two-stage Regex Extractor:
        - Pairing Stage: Extract 6-digit PIN (`\b\d{6}\b`) and pairing port (`:\d{4,5}`)
        - Connection Stage: Extract persistent connect port from status notification or mDNS daemon
[ ] 1.4 Accessibility Service helper to auto-navigate Developer Options if notification is suppressed
[ ] 1.5 Localhost TLS handshake execution: `adb pair 127.0.0.1:<pairing_port> <code>`
[ ] 1.6 Localhost connection establishment: `adb connect 127.0.0.1:<connect_port>`
[ ] 1.7 Silent execution of Device Owner elevation:
        `dpm set-device-owner com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver`
[ ] 1.8 Post-provisioning cleanup: Auto-disable Wireless Debugging & revoke debugging authorizations

================================================================================
PHASE 2: ACCESSIBILITY SERVICE LOCKDOWN & ANTI-TAMPER SENTINEL
================================================================================
[ ] 2.1 Implement `TelepointAccessibilityService.kt` with filter on `TYPE_WINDOW_STATE_CHANGED` & `TYPE_VIEW_CLICKED`
[ ] 2.2 OEM-agnostic Settings Package Filter (`com.android.settings`, `com.miui.securitycenter`, 
        `com.samsung.android.settings`, `com.coloros.safecenter`, `com.iqoo.secure`)
[ ] 2.3 Real-time node tree inspector: Block focus or clicks on:
        - "TelePoint", "Accessibility", "Disable", "Stop", "Clear Storage", "Force stop", "Uninstall"
[ ] 2.4 Active defense action:
        - Immediate `performGlobalAction(GLOBAL_ACTION_HOME)`
        - Display non-dismissible system overlay: "Device locked by Financer until EMI is settled"
[ ] 2.5 Device Owner OS-level enforcement:
        - Block uninstall: `dpm.setUninstallBlocked(adminComponent, packageName, true)`
        - Block Safe Mode boot: `dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)`
        - Block account additions: `dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_MODIFY_ACCOUNTS)`
        - Block credential resets: `dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_CREDENTIALS)`

================================================================================
PHASE 3: GOOGLE AUTHENTICATOR (TOTP) DYNAMIC OFFLINE UNLOCK SYSTEM
================================================================================
[ ] 3.1 Generate cryptographic base32 secret per device (`totp_secret`, 160-bit entropy) at customer registration
[ ] 3.2 Secure synchronization:
        - Backend: Store in Supabase `devices.totp_secret` (encrypted column)
        - Phone: Store in Android Keystore backed `EncryptedSharedPreferences` / `SecureStore`
[ ] 3.3 Implement standard RFC 6238 TOTP verification engine in Kotlin (`TotpEngine.kt`)
[ ] 3.4 Validity window: 30-minute time step with ±1 step drift tolerance (enables valid code for up to 60 min)
[ ] 3.5 Monotonic counter / Replay attack prevention: Store last successfully used timestamp window on disk
[ ] 3.6 Time-tampering defense:
        - Device Owner locks automatic network time: `dpm.setAutoTimeRequired(adminComponent, true)`
        - Block manual clock alteration: `dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_DATE_TIME)`
[ ] 3.7 Admin Portal UI: "Generate Offline Unlock Code" in `DeviceManagementPanel.tsx` using `otplib`
[ ] 3.8 Customer App UI: "Enter Offline Unlock Code" modal on `LockedScreen.tsx`
[ ] 3.9 Validation & Audit:
        - Match: Call `executeAuthorizedUnlock()`, dismiss kiosk overlay, log offline unlock event in SQLite
        - Mismatch: Exponential backoff (3 failed attempts = 5 min cooldown; 5 failed attempts = 30 min lockout)
[ ] 3.10 Background sync: Sync offline unlock event to Supabase `device_logs` upon internet reconnection

================================================================================
PHASE 4: SIM CARD REMOVAL / SWAP SENTINEL & SILENT EMERGENCY SMS
================================================================================
[ ] 4.1 Register `android.intent.action.SIM_STATE_CHANGED` receiver in `AndroidManifest.xml`
[ ] 4.2 Register `BOOT_COMPLETED` receiver to inspect SIM card immediately upon power-on
[ ] 4.3 Save baseline SIM 1 & SIM 2 ICCID and SubscriptionId in `EncryptedSharedPreferences` at store setup
[ ] 4.4 Detect SIM Removal (`SIM_STATE_ABSENT` on registered slot):
        - Trigger immediate hard lock (`executeAuthorizedLock()`)
        - Display locked screen: "SIM removed. Re-insert registered SIM to continue"
[ ] 4.5 Detect SIM Swap / Changed SIM:
        - Read new carrier name and active phone number via `SubscriptionManager.getActiveSubscriptionInfoList()`
        - Auto-grant `SEND_SMS` permission silently via Device Owner (`setPermissionGrantState`)
        - Dispatch silent background SMS to primary `7003617029` (and backup `7003617074`):
          "ALERT: Customer [Code/Name] SIM Removed/Changed! New SIM Phone: [number], Carrier: [carrier]"
        - Lock device immediately until authorized by financer
[ ] 4.6 Offline SMS Command Listener: Listen for authorized financer SMS command `UNLOCK <TOTP_PIN>` 
        from `7003617029` to unlock device remotely even if data/Wi-Fi is completely disabled

================================================================================
PHASE 5: ENTERPRISE FACTORY RESET PROTECTION (FRP) — `financebuddy144@gmail.com`
================================================================================
[ ] 5.1 Extract 21-digit numeric Gaia ID for `financebuddy144@gmail.com` via Google People API Explorer:
        `GET https://people.googleapis.com/v1/people/me?personFields=metadata`
[ ] 5.2 Validate that the account has passed Google's 72-hour security hold window
[ ] 5.3 Configure `FactoryResetProtectionPolicy` in `ExpoTelepointDeviceManagementModule.kt`:
        - Set accounts list: `listOf("<21_DIGIT_GAIA_ID>")`
        - Set `factoryResetProtectionEnabled = true`
[ ] 5.4 Dispatch explicit broadcast `com.google.android.gms.auth.FRP_CONFIG_CHANGED` to notify GMS
[ ] 5.5 Enforce hardware reset lockout: If phone is wiped via Recovery Mode (Power + Vol Up), Android setup 
        wizard halts at Google verification demanding `financebuddy144@gmail.com` credentials
[ ] 5.6 Automated Policy Release: When loan status changes to `PAID` / `SETTLED`, backend triggers silent 
        push to call `dpm.setFactoryResetProtectionPolicy(adminComponent, null)` to release phone to customer

================================================================================
PHASE 6: ZERO-CUSTOMER MAINTENANCE (SILENT BACKGROUND UPDATES)
================================================================================
[ ] 6.1 Expo EAS Update integration for silent JS bundle / UI patches without customer prompts
[ ] 6.2 Device Owner `PackageInstaller` integration for native APK updates:
        - `PackageInstaller.SessionParams(MODE_FULL_INSTALL)`
        - Stream APK from backend storage directly to session
        - Call `session.commit(statusReceiver)` with silent broadcast intent
[ ] 6.3 Auto-restart app after silent native update without requiring customer to tap or reopen
```

---

## 🥊 Arena-Skill Adversarial Analysis: Attacks & Ironclad Defenses

Applying the `arena-skill` competitive tournament methodology, we subject each module to hostile attack vectors (common OEM workarounds, customer tamper techniques, Android OS restrictions) and provide verified defenses.

### Module 1: On-Device Wireless Debugging Provisioning

| # | Attack Vector (Flaw / Failure Mode) | Severity | Ironclad Defense Implementation |
|---|---|---|---|
| **A1.1** | **Dynamic Port Discrepancy**: Android 11+ assigns *one* dynamic port for pairing (e.g., 38921) and a *different* dynamic port for the ADB server connection (e.g., 42109). If the app connects to the pairing port, `adb connect` fails. | **FATAL** | **Two-Stage Port Resolution**: Notification listener extracts the pairing port for `adb pair 127.0.0.1:<pairing_port>`. Then, the app queries Android's local mDNS service (`NsdManager`) resolving service type `_adb-tls-connect._tcp` to discover the active connection port before calling `adb connect 127.0.0.1:<connect_port>`. |
| **A1.2** | **Account Pre-existence**: If the phone was set up with any Google, Samsung, or Xiaomi account before running ADB, `dpm set-device-owner` throws `IllegalStateException: Not allowed to set device owner because there are already some accounts on the device`. | **FATAL** | **Pre-flight Account Check**: Store onboarding workflow strictly mandates: *Skip all account logins at setup wizard*. If an account is detected, app prompts store staff with a 1-tap shortcut to `Settings > Accounts` to remove all accounts before initiating pairing. |
| **A1.3** | **MIUI / HyperOS Security Gate**: Xiaomi devices disable ADB permission/app management commands unless "USB debugging (Security settings)" is toggled on with a signed-in Mi Account. | **MAJOR** | **Explicit Provisioning Fallback**: For Xiaomi/Poco/Redmi devices, store staff is guided through 1-time Mi verification toggle, OR guided to use the standard 6-tap Welcome Screen QR provisioner which bypasses MIUI security gates entirely. |
| **A1.4** | **Notification Suppression in Android 13/14**: Android 13+ requires `POST_NOTIFICATIONS` runtime permission; if disabled, pairing notification won't surface to NotificationListener. | **MAJOR** | **Pre-granting Notification Access**: Customer app prompts for `Settings > Notification Access` (`android.settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS`) before launching Developer Options. |

---

### Module 2: Accessibility Service Lockdown & Anti-Tamper

| # | Attack Vector (Flaw / Failure Mode) | Severity | Ironclad Defense Implementation |
|---|---|---|---|
| **A2.1** | **Safe Mode Bypass**: Customer reboots phone into Safe Mode (holding Power Off button) which disables all 3rd-party accessibility services, then uninstalls the app. | **FATAL** | **Safe Boot Lockdown via DO**: The instant Device Owner is achieved, call: <br>`dpm.addUserRestriction(admin, UserManager.DISALLOW_SAFE_BOOT)`. Phone firmware will refuse to enter Safe Mode even if hardware keys are held during boot. |
| **A2.2** | **OEM Class Hierarchy Fragmentation**: Customer opens Settings via Quick Settings gear icon or Voice Assistant. Searching for `com.android.settings` fails on Samsung (`com.sec.android.app.launcher` / `com.android.settings`), Xiaomi (`com.miui.securitycenter`), or Vivo (`com.iqoo.secure`). | **FATAL** | **Subtree Content Scanning**: Do not rely on package name alone. Inspect root node text content and view IDs recursively for keywords: `TelePoint`, `Accessibility`, `Disable`, `Force stop`, `Clear storage`, `Uninstall`. If matched in any package, fire `GLOBAL_ACTION_HOME`. |
| **A2.3** | **Process Killing via Task Switcher**: Customer swipes app away from Recent Apps list or uses OEM cleaner to kill the background service. | **MAJOR** | **Foreground Sticky Service + KeepAlive**: Run as `START_STICKY` with foreground notification and Device Owner protection: `dpm.setPackageSuspended(admin, packageName, false)` and exempt from battery optimization (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). |

---

### Module 3: Google Authenticator (TOTP) Offline Dynamic Unlock

| # | Attack Vector (Flaw / Failure Mode) | Severity | Ironclad Defense Implementation |
|---|---|---|---|
| **A3.1** | **Clock Tampering / Dead Battery Epoch Drift**: Customer changes phone date/time manually to generate past/future codes, or device battery drains completely resetting system time to Jan 1, 1970. | **FATAL** | **Network Time Enforcement + Drift Window**: <br>1. Device Owner locks automatic network time: `dpm.setAutoTimeRequired(admin, true)` and blocks manual date/time settings: `dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME)`.<br>2. TOTP verification engine tolerates ±1 time step (30 min past to 30 min future).<br>3. Persistent uptime tracking: Device records `SystemClock.elapsedRealtime()` periodically to detect backward time jumps. |
| **A3.2** | **Offline Brute-Force Guessing**: Since 6-digit codes only have 1,000,000 combinations, a customer could attempt manual or automated input on the locked screen. | **MAJOR** | **Exponential Cooldown Enforcer**: Store failed attempts in Keystore-backed storage. 3 consecutive failures = 5-minute lockout; 5 consecutive failures = 30-minute lockout with screen touch freeze. |
| **A3.3** | **Replay Attack**: Customer re-enters a code that worked previously during the same 30-minute interval. | **MAJOR** | **Consumed Token Registry**: Maintain a list of the last 5 used timestamp tokens (`timeStep = currentTime / 1800`). If a code matches an already-consumed token, it is immediately rejected. |

---

### Module 4: SIM Card Removal / Swap Sentinel & Emergency SMS

| # | Attack Vector (Flaw / Failure Mode) | Severity | Ironclad Defense Implementation |
|---|---|---|---|
| **A4.1** | **SIM Swap While Powered OFF**: Customer turns phone off, removes SIM 1, inserts a different SIM, and powers the phone back on without Wi-Fi. | **FATAL** | **Boot-Phase SIM Check**: Register a high-priority `BOOT_COMPLETED` receiver (`android:priority="999"`). Before UI or network initialization, compare active SIM ICCID against baseline in `EncryptedSharedPreferences`. If mismatch is found, trigger `executeAuthorizedLock()` immediately. |
| **A4.2** | **Zero Balance / SMS Failure**: New SIM has zero SMS balance or carrier blocks background SMS. | **MAJOR** | **Dual Alert Channel + Local Freeze**: Dispatch SMS to `7003617029` (backup: `7003617074`). Regardless of whether SMS delivery report succeeds or fails, the device enforces immediate hard lock. The moment data/Wi-Fi is reconnected, an alert payload is dispatched to Supabase. |
| **A4.3** | **Airplane Mode Blockade**: Customer turns on Airplane Mode to prevent SMS dispatch. | **MAJOR** | **DO Airplane Mode Restriction**: Device Owner disables Airplane Mode toggle: `dpm.addUserRestriction(admin, UserManager.DISALLOW_AIRPLANE_MODE)`. Furthermore, lock screen hides the status bar and Quick Settings pull-down. |

---

### Module 5: Enterprise Factory Reset Protection (FRP) with `financebuddy144@gmail.com`

| # | Attack Vector (Flaw / Failure Mode) | Severity | Ironclad Defense Implementation |
|---|---|---|---|
| **A5.1** | **String Email Rejection**: Supplying `"financebuddy144@gmail.com"` directly into `setFactoryResetProtectionAccounts` fails silently on Google Play Services (GMS), leaving the phone unprotected after a recovery wipe. | **FATAL** | **21-Digit Gaia ID Requirement**: Extract the exact numeric Gaia ID (e.g. `108472918374829104829`) corresponding to `financebuddy144@gmail.com` via Google People API. Inject the numeric ID string into `setFactoryResetProtectionAccounts(listOf("<GAIA_ID>"))`. |
| **A5.2** | **72-Hour GMS Security Freeze**: If `financebuddy144@gmail.com` is newly created or had its password changed, Google GMS rejects it for FRP unlocks for 72 hours. | **MAJOR** | **Pre-provisioning Verification**: Ensure `financebuddy144@gmail.com` is established at least 72 hours prior to enrolling devices. |
| **A5.3** | **OEM Recovery Mode Wipe**: Customer boots into hardware recovery mode (Power + Vol Up) and selects "Wipe data / Factory reset". | **CONTROLLED** | **Post-Wipe Gate**: Android runtime cannot prevent recovery wipe because recovery runs in hardware bootloader. However, upon post-wipe reboot, Google Setup Wizard checks GMS partition, discovers the persistent FRP policy, and permanently halts setup until `financebuddy144@gmail.com` credentials are authenticated. |

---

## 🛠️ Deep Technical Guide: Setup & Implementation Details

### 1. How to Setup FRP with `financebuddy144@gmail.com`

#### Step 1: Extract the 21-Digit Numeric Gaia ID
1. Open a browser and sign in to **`financebuddy144@gmail.com`**.
2. Navigate to Google's official **People API Explorer**:
   `https://developers.google.com/people/api/rest/v1/people/get`
3. In the right-hand panel ("Try this method"):
   - Set **`resourceName`** to: `people/me`
   - Set **`personFields`** to: `metadata`
4. Click **Execute** and sign in with `financebuddy144@gmail.com`.
5. In the JSON response, locate the `resourceName` field:
   ```json
   {
     "resourceName": "people/109847291823746192837",
     "metadata": { ... }
   }
   ```
6. The numeric string `109847291823746192837` is the **Gaia User ID**.

#### Step 2: Configure Policy in Kotlin Native Module
In `ExpoTelepointDeviceManagementModule.kt`:
```kotlin
fun configureFactoryResetProtection(context: Context, dpm: DevicePolicyManager, admin: ComponentName) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val gaiaUserId = "109847291823746192837" // 21-digit ID for financebuddy144@gmail.com
        
        val frpPolicy = FactoryResetProtectionPolicy.Builder()
            .setFactoryResetProtectionAccounts(listOf(gaiaUserId))
            .setFactoryResetProtectionEnabled(true)
            .build()

        dpm.setFactoryResetProtectionPolicy(admin, frpPolicy)

        // Broadcast to Google Play Services to persist configuration
        val intent = Intent("com.google.android.gms.auth.FRP_CONFIG_CHANGED").apply {
            setPackage("com.google.android.gms")
        }
        context.sendBroadcast(intent)
    }
}
```

#### Step 3: Automated Policy Clearance on Loan Payoff
When the customer clears their final EMI:
```kotlin
fun clearFactoryResetProtection(dpm: DevicePolicyManager, admin: ComponentName) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // Passing null clears FRP allowlist, converting device back to consumer mode
        dpm.setFactoryResetProtectionPolicy(admin, null)
    }
}
```

---

### 2. Google Authenticator (TOTP) Offline Dynamic Unlock

#### Kotlin Verification Engine (`TotpEngine.kt`)
```kotlin
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.pow

object TotpEngine {
    private const val TIME_STEP_SECONDS = 1800L // 30-minute validity window
    private const val DIGITS = 6

    fun verifyCode(base32Secret: String, userInputCode: String): Boolean {
        val currentTime = System.currentTimeMillis() / 1000L
        val currentStep = currentTime / TIME_STEP_SECONDS

        // Check current window, previous window (-1), and next window (+1) for clock drift
        for (i in -1..1) {
            val generatedCode = generateTotp(base32Secret, currentStep + i)
            if (generatedCode == userInputCode) {
                return true
            }
        }
        return false
    }

    private fun generateTotp(base32Secret: String, step: Long): String {
        val key = Base32.decode(base32Secret)
        val data = ByteArray(8)
        var value = step
        for (i in 7 downTo 0) {
            data[i] = (value and 0xFF).toByte()
            value = value shr 8
        }

        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(key, "HmacSHA1"))
        val hash = mac.doFinal(data)

        val offset = hash[hash.size - 1].toInt() and 0xF
        val truncatedHash = ((hash[offset].toInt() and 0x7F) shl 24) or
                ((hash[offset + 1].toInt() and 0xFF) shl 16) or
                ((hash[offset + 2].toInt() and 0xFF) shl 8) or
                (hash[offset + 3].toInt() and 0xFF)

        val otp = truncatedHash % 10.0.pow(DIGITS.toDouble()).toInt()
        return String.format("%0${DIGITS}d", otp)
    }
}
```

---

### 3. SIM Removal / Swap Sentinel & Emergency SMS

#### SIM Change BroadcastReceiver (`SimStateReceiver.kt`)
```kotlin
class SimStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "android.intent.action.SIM_STATE_CHANGED" ||
            intent.action == Intent.ACTION_BOOT_COMPLETED) {

            val prefs = context.getSharedPreferences("telepoint_sim_guard", Context.MODE_PRIVATE)
            val registeredIccid = prefs.getString("registered_sim1_iccid", null) ?: return

            val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val activeList = subManager.activeSubscriptionInfoList

            if (activeList.isNullOrEmpty()) {
                // SIM card completely absent
                TelepointLockEngine.executeHardLock(context, "SIM 1 removed. Re-insert registered SIM.")
                return
            }

            val currentSim1 = activeList.firstOrNull { it.simSlotIndex == 0 }
            val currentIccid = currentSim1?.iccId

            if (currentIccid != registeredIccid) {
                // SIM was swapped!
                val newNumber = currentSim1?.number ?: "Unknown"
                val carrier = currentSim1?.carrierName ?: "Unknown"

                // Dispatch silent background SMS to primary and backup numbers
                val smsManager = SmsManager.getDefault()
                val message = "ALERT: Telepoint customer SIM changed! New Phone: $newNumber, Carrier: $carrier, ICCID: $currentIccid"
                
                smsManager.sendTextMessage("7003617029", null, message, null, null)
                smsManager.sendTextMessage("7003617074", null, message, null, null)

                // Lock device immediately
                TelepointLockEngine.executeHardLock(context, "Unauthorized SIM card detected. Device locked.")
            }
        }
    }
}
```

---

### 4. Zero-Customer Maintenance: Silent Background APK Install

#### Device Owner Silent `PackageInstaller` (`PackageInstallEngine.kt`)
```kotlin
fun installApkSilently(context: Context, apkFile: File) {
    val packageInstaller = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
    val sessionId = packageInstaller.createSession(params)
    val session = packageInstaller.openSession(sessionId)

    apkFile.inputStream().use { input ->
        session.openWrite("telepoint_update", 0, apkFile.length()).use { output ->
            input.copyTo(output)
            session.fsync(output)
        }
    }

    // Intent receiver for installation status callback
    val intent = Intent(context, PackageInstallStatusReceiver::class.java)
    val pendingIntent = PendingIntent.getBroadcast(
        context, sessionId, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )

    // Commit silently — Device Owner suppresses system install prompt
    session.commit(pendingIntent.intentSender)
    session.close()
}
```

---

## 🎯 Verification & Sign-Off Criteria

1. **On-Device Wireless Provisioning**:
   - Store counter staff can enable Wireless Debugging, launch the pairing prompt, and have the app capture credentials and self-elevate to Device Owner within **45 seconds** without plugging in a USB cable.
2. **Accessibility Lockdown**:
   - Customer cannot toggle off Accessibility Service in Settings; any tap on "Disable" triggers an immediate return to Home Screen with alert banner.
3. **Offline TOTP Unlock**:
   - Admin generates 6-digit code for customer in portal; customer types code on locked screen with Wi-Fi/Mobile Data turned off; device unlocks cleanly.
4. **SIM Sentinel**:
   - Ejecting SIM tray locks screen within **2 seconds**; inserting unauthorized SIM dispatches background SMS to `7003617029` and locks device.
5. **Factory Reset Protection**:
   - Performing a hardware recovery wipe traps device at Google Setup Wizard requiring `financebuddy144@gmail.com`.
6. **Zero-Customer Updates**:
   - EAS JS updates and native APK updates download and install silently in background without prompting customer.
