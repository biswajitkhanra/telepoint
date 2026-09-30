# TelePoint — Incomplete Features Implementation Blueprint
## Battle-Tested Specifications for All "NOT DONE" & "PARTIAL" Items
**Generated via Agent Reach research & Arena-Skill adversarial hardening**

---

### Executive Overview

According to the comprehensive code audit in [`docs/cross_check.md`](file:///d:/telepoint/telepoint/docs/cross_check.md), 18 of 29 features are fully implemented, while **6 features are NOT DONE** and **5 features are PARTIALLY DONE**.

This blueprint provides the exact, production-ready implementation architecture, Kotlin/TypeScript function designs, intent structures, and failure guards for every outstanding feature.

---

### 1. Feature 10: Per-App Lock / Unlock Overlay (Status: 🟡 PARTIAL -> Solution)

#### Problem in Codebase
The app currently supports whole-device Kiosk mode lock and whole-device app hiding (`hideAllUserApps`), but lacks a selective per-app PIN lock (e.g., locking WhatsApp, YouTube, or Gallery behind a PIN while keeping Phone, Settings, and TelePoint accessible).

#### Best Implementation Architecture
Leverage `TelepointAccessibilityService.kt` combined with Android's `WindowManager` overlay (`TYPE_APPLICATION_OVERLAY`).

```kotlin
// Location: mobile/android/app/src/main/java/com/telepoint/devicemanagement/AppLockManager.kt

class AppLockManager(private val context: Context) {
    private val lockedPackages = mutableSetOf<String>()
    private var unlockedTemporarily = mutableMapOf<String, Long>()

    fun setLockedPackages(packages: List<String>) {
        lockedPackages.clear()
        lockedPackages.addAll(packages)
    }

    fun handleWindowStateChanged(packageName: String, service: AccessibilityService) {
        if (!lockedPackages.contains(packageName)) return

        // Check if recently unlocked within temporary grace window (e.g. 60 seconds)
        val lastUnlocked = unlockedTemporarily[packageName] ?: 0L
        if (System.currentTimeMillis() - lastUnlocked < 60_000L) return

        // App is locked — launch non-dismissible lock overlay
        val intent = Intent(service, AppLockOverlayActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("TARGET_PACKAGE", packageName)
        }
        service.startActivity(intent)
    }

    fun grantTemporaryUnlock(packageName: String) {
        unlockedTemporarily[packageName] = System.currentTimeMillis()
    }
}
```

---

### 2. Feature 11, 24 & 25: Branded Overdue Wallpaper Injection & Reversion (Status: 🟡 PARTIAL -> Solution)

#### Problem in Codebase
Code only sets `UserManager.DISALLOW_SET_WALLPAPER` (preventing customer from changing wallpaper), but does NOT programmatically inject the red "TelePoint Financed — EMI Overdue" wallpaper or revert it upon unlock.

#### Best Implementation Architecture
Use Android's `WallpaperManager` API. When locking, save the customer's current wallpaper to private cache, inject the overdue banner bitmap, and lock wallpaper changes. When unlocking, restore the cached image.

```kotlin
// Location: mobile/android/app/src/main/java/com/telepoint/devicemanagement/WallpaperManagerHelper.kt

object WallpaperManagerHelper {
    private const val CACHED_WALLPAPER = "customer_cached_wallpaper.png"

    fun setOverdueWallpaper(context: Context, bitmap: Bitmap) {
        val wm = WallpaperManager.getInstance(context)
        try {
            // 1. Cache existing wallpaper if not already saved
            val cacheFile = File(context.filesDir, CACHED_WALLPAPER)
            if (!cacheFile.exists()) {
                val drawable = wm.drawable
                if (drawable is BitmapDrawable) {
                    cacheFile.outputStream().use { out ->
                        drawable.bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    }
                }
            }

            // 2. Set branded red overdue wallpaper on both Home and Lock screen
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                wm.setBitmap(bitmap, null, true, WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK)
            } else {
                wm.setBitmap(bitmap)
            }
        } catch (e: Exception) {
            Log.e("Telepoint", "Failed to set overdue wallpaper", e)
        }
    }

    fun restoreCustomerWallpaper(context: Context) {
        val wm = WallpaperManager.getInstance(context)
        val cacheFile = File(context.filesDir, CACHED_WALLPAPER)
        if (cacheFile.exists()) {
            try {
                val bitmap = BitmapFactory.decodeFile(cacheFile.absolutePath)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    wm.setBitmap(bitmap, null, true, WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK)
                } else {
                    wm.setBitmap(bitmap)
                }
                cacheFile.delete()
            } catch (e: Exception) {
                wm.clear() // Fallback to system default wallpaper
            }
        }
    }
}
```

---

### 3. Feature 16 & 17: SIM Card Removal Auto-Lock & Offline Sentinel (Status: ❌ NOT DONE -> Solution)

#### Problem in Codebase
No receiver listens for `android.intent.action.SIM_STATE_CHANGED`. If the customer ejects the SIM tray or swaps SIM cards while offline, the phone does not automatically lock.

#### Best Implementation Architecture
Register a persistent `BroadcastReceiver` targeting `SIM_STATE_CHANGED` and `BOOT_COMPLETED`. Upon any state change, compare the live ICCID with the baseline stored during device enrollment.

```kotlin
// Location: mobile/android/app/src/main/java/com/telepoint/devicemanagement/SimSentinelReceiver.kt

class SimSentinelReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != "android.intent.action.SIM_STATE_CHANGED" && action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences("telepoint_sim_guard", Context.MODE_PRIVATE)
        val baselineIccid = prefs.getString("baseline_sim_iccid", null) ?: return

        val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
        val activeSubscriptions = subManager.activeSubscriptionInfoList

        if (activeSubscriptions.isNullOrEmpty()) {
            // SIM 1 removed completely!
            TelepointLockEngine.executeHardLock(
                context, 
                "Registered SIM card removed. Re-insert registered SIM or contact store."
            )
            return
        }

        val primarySub = activeSubscriptions.firstOrNull { it.simSlotIndex == 0 }
        val currentIccid = primarySub?.iccId

        if (currentIccid != baselineIccid) {
            // Unauthorized SIM card inserted!
            val newNumber = primarySub?.number ?: "Hidden/Prepaid"
            val carrier = primarySub?.carrierName ?: "Unknown"

            // Dispatch emergency background SMS to financer numbers
            val sms = SmsManager.getDefault()
            val alert = "ALERT: TelePoint SIM Swapped! Customer ID: ${prefs.getString("customer_code", "")} New Number: $newNumber Carrier: $carrier ICCID: $currentIccid"
            
            sms.sendTextMessage("7003617029", null, alert, null, null)
            sms.sendTextMessage("7003617074", null, alert, null, null)

            // Trigger immediate hard lock
            TelepointLockEngine.executeHardLock(
                context, 
                "Unauthorized SIM detected. Device locked by Financer."
            )
        }
    }
}
```

In `AndroidManifest.xml`:
```xml
<receiver
    android:name=".devicemanagement.SimSentinelReceiver"
    android:exported="true">
    <intent-filter android:priority="999">
        <action android:name="android.intent.action.SIM_STATE_CHANGED" />
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

---

### 4. Feature 18: OEM Autostart Intent Dispatcher ("MIUI / Vivo / Oppo Permission") (Status: ❌ NOT DONE -> Solution)

#### Problem in Codebase
Standard Android battery optimization exemption (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) is ignored by Chinese OEM aggressive task killers (Xiaomi MIUI/HyperOS, Vivo Funtouch, Oppo ColorOS). Background services get terminated after 15 minutes of screen off unless "Autostart" is granted manually.

#### Best Implementation Architecture
Create a native helper that inspects `Build.MANUFACTURER` and launches the vendor's proprietary autostart manager intent.

```kotlin
// Location: mobile/android/app/src/main/java/com/telepoint/devicemanagement/OemPermissionHelper.kt

object OemPermissionHelper {
    fun openOemAutostartSettings(context: Context): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intents = mutableListOf<Intent>()

        when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
                intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")))
            }
            manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
                intents.add(Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")))
                intents.add(Intent().setComponent(ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")))
            }
            manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus") -> {
                intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")))
                intents.add(Intent().setComponent(ComponentName("com.oplus.battery", "com.oplus.battery.startup.StartupAppListActivity")))
            }
            manufacturer.contains("transsion") || manufacturer.contains("infinix") || manufacturer.contains("tecno") -> {
                intents.add(Intent().setComponent(ComponentName("com.transsion.phonemaster", "com.transsion.phonemaster.MainActivity")))
            }
        }

        for (intent in intents) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null) {
                context.startActivity(intent)
                return true
            }
        }

        // Fallback: standard application details settings
        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(fallback)
        return false
    }
}
```

---

### 5. Feature 23: Offline SMS Location Reply (`LOC <custid>`) (Status: ❌ NOT DONE -> Solution)

#### Problem in Codebase
`SmsCommandReceiver.kt` currently processes `TRACK ON` and `TRACK OFF`, but if the financer texts `LOC <custid>`, it does NOT fetch GPS coordinates and reply via SMS.

#### Best Implementation Architecture
In `SmsCommandReceiver.kt`, add the `LOC` command handler. Retrieve `LocationManager.getLastKnownLocation()`, format the SMS string with a direct Google Maps URL, and send via `SmsManager.sendTextMessage()`.

```kotlin
// Extension to SmsCommandReceiver.kt

private fun handleLocationSmsRequest(context: Context, senderPhone: String, customerCode: String) {
    val locManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    var location = try {
        locManager.getLastKnownLocation(LocationManager.GPS_PROVIDER) 
            ?: locManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
    } catch (e: SecurityException) {
        null
    }

    val replyMessage = if (location != null) {
        val lat = String.format("%.5f", location.latitude)
        val lng = String.format("%.5f", location.longitude)
        val time = SimpleDateFormat("dd-MM HH:mm", Locale.getDefault()).format(Date(location.time))
        "TelePoint LOC [$customerCode]: Lat $lat, Lng $lng, Time: $time. Maps: https://maps.google.com/?q=$lat,$lng"
    } else {
        "TelePoint LOC [$customerCode]: GPS coordinate unavailable. Device may be indoors."
    }

    val sms = SmsManager.getDefault()
    sms.sendTextMessage(senderPhone, null, replyMessage, null, null)
}
```

---

### 6. Feature 19 & 20: Web Admin Panel Deep Link & DO Uninstall Actions (Status: ❌ NOT DONE / 🟡 PARTIAL -> Solution)

#### Problem in Codebase
In `components/DeviceManagementPanel.tsx`:
1. There is no button to generate and copy the customer portal onboarding deep link.
2. There is no explicit "Release Management / Uninstall Device Owner" button.

#### Best Implementation Architecture
Add the following UI triggers to `DeviceManagementPanel.tsx`:

```tsx
// Location: components/DeviceManagementPanel.tsx

{/* Action Row: Deep Link & Release Management */}
<div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/60 mt-3">
  {/* 1. Copy Customer Deep Link */}
  <button
    type="button"
    onClick={() => {
      const link = `${window.location.origin}/c/${device.customer_id}`;
      navigator.clipboard.writeText(link);
      toast.success("Customer onboarding link copied to clipboard!");
    }}
    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors flex items-center gap-1.5"
  >
    <Copy className="w-3.5 h-3.5" />
    Copy Deep Link
  </button>

  {/* 2. Release Management / Uninstall Button */}
  <button
    type="button"
    onClick={async () => {
      const confirmed = window.confirm(
        "WARNING: This will permanently strip Device Owner status and unlock all restrictions. Only use if EMI is fully paid. Continue?"
      );
      if (!confirmed) return;

      try {
        await executeDeviceAction(device.id, "RELEASE_MANAGEMENT");
        toast.success("Release command dispatched to device!");
      } catch (err: any) {
        toast.error(`Failed to release device: ${err.message}`);
      }
    }}
    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors flex items-center gap-1.5 ml-auto"
  >
    <Trash2 className="w-3.5 h-3.5" />
    Release Management (Uninstall)
  </button>
</div>
```

---

### 7. Feature 27 & 28: Layout Structure & Fixed Bottom Bar (Status: 🟡 PARTIAL -> Solution)

#### Problem in Codebase
The reference screen displays persistent, floating bottom **[ Lock ]** and **[ Unlock ]** buttons and 3 distinct top tabs: `Customer Details`, `Device Management`, `Action Details`. Currently, TelePoint embeds everything inside accordion panels without a fixed bottom CTA bar.

#### Best Implementation Architecture
Wrap `DeviceManagementPanel.tsx` in a tabbed container with a sticky bottom navigation bar:

```tsx
{/* Sticky Persistent Bottom Action Bar */}
<div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 flex gap-3 max-w-xl mx-auto shadow-2xl">
  <button
    type="button"
    onClick={() => handleExecuteLock()}
    disabled={isLocked || isOperating}
    className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
  >
    <Lock className="w-4 h-4" />
    Lock Device
  </button>

  <button
    type="button"
    onClick={() => handleExecuteUnlock()}
    disabled={!isLocked || isOperating}
    className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
  >
    <Unlock className="w-4 h-4" />
    Unlock Device
  </button>
</div>
```

---

## 📊 Summary of Implementation Effort

| Feature | Difficulty | Target File | Core Technology / API |
|---|:---:|---|---|
| **App Lock / Unlock (Per-App)** | Medium | `AppLockManager.kt` | `AccessibilityService` + `TYPE_APPLICATION_OVERLAY` |
| **Branded Overdue Wallpaper** | Low | `WallpaperManagerHelper.kt` | `WallpaperManager.setBitmap` + Local PNG Caching |
| **SIM Removal Auto-Lock** | Medium | `SimSentinelReceiver.kt` | `SIM_STATE_CHANGED` + `SubscriptionManager` + `SmsManager` |
| **OEM Autostart Intent** | Low | `OemPermissionHelper.kt` | Vendor Intent (`com.miui.securitycenter`, `com.iqoo.secure`) |
| **Offline Location SMS Reply** | Low | `SmsCommandReceiver.kt` | `LocationManager.getLastKnownLocation` + `SmsManager` |
| **Web Panel Deep Link & Uninstall** | Low | `DeviceManagementPanel.tsx` | Clipboard API + Supabase Action Dispatcher |
| **Fixed Bottom Action Bar** | Low | `DeviceManagementPanel.tsx` | Fixed sticky CSS layout with Lock/Unlock CTAs |
