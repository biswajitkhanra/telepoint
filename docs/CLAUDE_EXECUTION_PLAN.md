# 🤖 Claude Execution Plan: TelePoint MDM Incomplete Features

**ATTENTION CLAUDE / AI ASSISTANT:** You are tasked with implementing the remaining MDM features for the `TelePoint` application. Read this entire document carefully. Do NOT delete existing features; only *add* or *modify* to achieve the robust implementations specified below.

## 🎯 Architectural Context
The native Android code is located in a local Expo Module at:
`mobile/modules/expo-telepoint-device-management/android/src/main/java/com/telepoint/devicemanagement/`

The web backend UI is located at:
`components/DeviceManagementPanel.tsx`

---

## 🛠️ Task 1: SIM Removal Auto-Lock & Offline Sentinel (Critical)

**Target Files:** 
1. `mobile/modules/expo-telepoint-device-management/android/src/main/java/com/telepoint/devicemanagement/SimSentinelReceiver.kt` (New File)
2. `mobile/modules/expo-telepoint-device-management/android/src/main/AndroidManifest.xml` (Update)

**Instructions for Claude:**
1. Create `SimSentinelReceiver.kt` in the native module directory. It must extend `BroadcastReceiver`.
2. Listen for `android.intent.action.SIM_STATE_CHANGED` and `Intent.ACTION_BOOT_COMPLETED`.
3. Read `SubscriptionManager.getActiveSubscriptionInfoList()`.
4. If SIM is absent on slot 0, call `TelepointLockEngine.executeHardLock()` (or equivalent local lock function).
5. If a new SIM is detected (ICCID mismatch with baseline from `SharedPreferences`), silently dispatch an SMS to `7003617029` using `SmsManager` and immediately lock the device.
6. Register the receiver in the module's `AndroidManifest.xml` with priority `999`.

---

## 🛠️ Task 2: OEM Autostart Intent Dispatcher (Anti-Tamper)

**Target File:** `mobile/modules/expo-telepoint-device-management/android/src/main/java/com/telepoint/devicemanagement/ExpoTelepointDeviceManagementModule.kt`

**Instructions for Claude:**
1. Add a new `Promise` function `@AsyncFunction fun openOemAutostartSettings()`.
2. Implement intent dispatching based on `android.os.Build.MANUFACTURER.lowercase()`:
   * **Xiaomi/Redmi/Poco:** `com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity`
   * **Vivo/iQOO:** `com.iqoo.secure/com.iqoo.secure.ui.phoneoptimize.BgStartUpManager`
   * **Oppo/Realme:** `com.coloros.safecenter/com.coloros.safecenter.startupapp.StartupAppListActivity`
3. Catch `ActivityNotFoundException` and fallback to `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`.

---

## 🛠️ Task 3: Enterprise FRP Setup (`financebuddy144@gmail.com`)

**Target File:** `mobile/modules/expo-telepoint-device-management/android/src/main/java/com/telepoint/devicemanagement/ExpoTelepointDeviceManagementModule.kt`

**Instructions for Claude:**
1. Update or create the `setFactoryResetProtectionPolicy` function.
2. Hardcode the exact 21-digit Gaia ID string for `financebuddy144@gmail.com`: `val gaiaUserId = "106892760455009935120"`.
3. Construct the policy: `FactoryResetProtectionPolicy.Builder().setFactoryResetProtectionAccounts(listOf(gaiaUserId)).setFactoryResetProtectionEnabled(true).build()`.
4. Apply the policy: `dpm.setFactoryResetProtectionPolicy(adminComponent, policy)`.
5. **CRITICAL:** Broadcast `com.google.android.gms.auth.FRP_CONFIG_CHANGED` to `com.google.android.gms` immediately after setting the policy to force Google Play Services to sync the lock.

---

## 🛠️ Task 4: Branded Overdue Wallpaper Injection

**Target File:** `mobile/modules/expo-telepoint-device-management/android/src/main/java/com/telepoint/devicemanagement/ExpoTelepointDeviceManagementModule.kt`

**Instructions for Claude:**
1. In the lock function, use `WallpaperManager.getInstance(context)`.
2. Fetch a solid RED bitmap or a branded "EMI OVERDUE" asset from the app bundle.
3. Apply the bitmap using `wm.setBitmap(bitmap, null, true, WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK)`.
4. Enforce `dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SET_WALLPAPER)` so the customer cannot change it back.

---

## 🛠️ Task 5: Web Admin Panel Enhancements

**Target File:** `components/DeviceManagementPanel.tsx` (or equivalent Web UI file)

**Instructions for Claude:**
1. Find the device info header section. Add a "Copy Deep Link" button that writes `${window.location.origin}/c/${device.customer_id}` to `navigator.clipboard`.
2. Add a red "Release Management (Uninstall)" button. It must trigger a `window.confirm` warning before dispatching a `RELEASE_MANAGEMENT` command to Supabase.
3. Wrap the primary Lock/Unlock buttons in a `fixed bottom-0 w-full flex gap-3 p-4 bg-slate-900` persistent sticky bottom navigation bar so they are always visible regardless of scrolling.

---

**Claude, once you have read this file, proceed to edit the files specified above and implement the solutions. Output a confirmation summary once all code injections are complete.**
