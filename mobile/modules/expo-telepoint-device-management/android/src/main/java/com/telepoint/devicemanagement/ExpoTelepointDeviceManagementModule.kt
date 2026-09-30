package com.telepoint.devicemanagement

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import android.telephony.SubscriptionManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * TelePoint consent-based EMI device management (Android).
 *
 * Uses only documented, supported Android APIs (DevicePolicyManager /
 * DeviceAdminReceiver). It never bypasses the system permission dialog, never
 * silently enables admin, never uses root / accessibility / hidden APIs, and
 * never impersonates Android system UI.
 *
 * Capability is gated by the device's management mode:
 *   UNMANAGED      → no lock capability (report honestly; guide enrollment)
 *   DEVICE_ADMIN   → soft screen-lock only (lockNow); the user can still unlock
 *                    with their own PIN — Android does not permit an un-exitable
 *                    lock for a plain device admin, and we do not fake one.
 *   PROFILE_OWNER  → work profile; cannot lock the whole personal device
 *   DEVICE_OWNER   → fully managed (provisioned at the store on a fresh device):
 *                    the ONLY mode that supports the true financing lock —
 *                    kiosk/lock-task, HOME-launcher takeover, uninstall +
 *                    factory-reset blocking, reboot persistence. The customer
 *                    cannot exit it; only an authorised backend UNLOCK releases.
 *
 * We implement the strongest LEGITIMATE operation the current mode supports and
 * report the mode so the app can explain any limitation.
 */
class ExpoTelepointDeviceManagementModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val dpm: DevicePolicyManager
    get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private val adminComponent: ComponentName
    get() = ComponentName(context, TelepointDeviceAdminReceiver::class.java)

  private fun isDeviceOwner(): Boolean = dpm.isDeviceOwnerApp(context.packageName)

  private fun launcherComponent(): ComponentName? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.component

  /**
   * KIOSK/lock-state policies only (Device Owner). Applied when LOCKED, cleared
   * when UNLOCKED. Deliberately does NOT touch factory-reset / safe-boot / FRP /
   * uninstall — those are collateral protections tied to the LOAN being
   * outstanding (see applyFinancingProtection), so a normal UNLOCK never strips
   * them while the customer still owes money.
   *   • whitelist self for lock-task (kiosk with no user confirmation)
   *   • while locked: make this app the HOME launcher so a reboot lands on the
   *     lock screen; cleared on release
   */
  private fun applyLockPolicies(active: Boolean) {
    if (!isDeviceOwner()) return
    val admin = adminComponent
    val pkg = context.packageName

    try {
      dpm.setLockTaskPackages(admin, if (active) arrayOf(pkg) else arrayOf())
    } catch (_: Exception) {}

    // While kiosked, still let the customer reach the notification shade / quick
    // settings + power menu so they can turn ON Wi-Fi / mobile data (needed for
    // the phone to receive the UNLOCK). HOME is deliberately NOT allowed, so they
    // cannot leave the lock screen.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        dpm.setLockTaskFeatures(
          admin,
          if (active)
            (DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS or
              DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD or
              DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO or
              DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS)
          else DevicePolicyManager.LOCK_TASK_FEATURE_NONE,
        )
      } catch (_: Exception) {}
    }

    val launcher = launcherComponent()
    if (launcher != null) {
      try {
        if (active) {
          val filter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
          }
          dpm.addPersistentPreferredActivity(admin, filter, launcher)
        } else {
          dpm.clearPackagePersistentPreferredActivities(admin, pkg)
        }
      } catch (_: Exception) {}
    }
  }

  /** Parse a JSON array (or comma list) of FRP account identifiers, safely. */
  private fun parseFrpAccounts(raw: String?): List<String> {
    if (raw.isNullOrBlank()) return emptyList()
    return try {
      val arr = org.json.JSONArray(raw)
      (0 until arr.length()).mapNotNull { arr.optString(it, null)?.trim()?.ifBlank { null } }
    } catch (_: Exception) {
      raw.split(',').map { it.trim() }.filter { it.isNotEmpty() }
    }
  }

  /**
   * Collateral protection applied WHILE THE LOAN IS OUTSTANDING (independent of
   * lock state). Device Owner only. When active:
   *   • block uninstall of the collateral app
   *   • DISALLOW_FACTORY_RESET — blocks a Settings-menu factory reset
   *   • DISALLOW_SAFE_BOOT     — blocks entering Safe Mode at all
   *   • DISALLOW_ADD_USER      — stops sidestepping via a new user
   *   • Factory Reset Protection policy (Android 11+/API 30, supported devices):
   *     even a recovery-mode wipe (which no app can block) then demands the
   *     configured account before the phone can be set up again.
   * Released (all cleared) once the EMI is fully paid.
   *
   * IMPORTANT/HONEST: a hardware recovery wipe cannot be prevented by any app;
   * FRP is the deterrent for that path, and it only works on Device Owner +
   * Android 11+ + devices whose OEM implements FactoryResetProtectionPolicy.
   */
  private fun applyFinancingProtection(active: Boolean, frpAccounts: List<String>): Map<String, Any?> {
    val mode = currentMode()
    if (mode != "DEVICE_OWNER") {
      return mapOf("applied" to false, "mode" to mode, "reason" to "requires_device_owner")
    }
    val admin = adminComponent
    val pkg = context.packageName

    try { dpm.setUninstallBlocked(admin, pkg, active) } catch (_: Exception) {}

    // Keep the OS from letting the user force-stop / swipe-kill the collateral
    // app (API 30+), so reminders + command delivery keep running — the DO-native
    // alternative to the battery-optimisation prompt.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      try { dpm.setUserControlDisabledPackages(admin, if (active) listOf(pkg) else emptyList()) } catch (_: Exception) {}
    }

    val restrictions = listOf(
      UserManager.DISALLOW_FACTORY_RESET,
      UserManager.DISALLOW_SAFE_BOOT,
      UserManager.DISALLOW_ADD_USER,
      // Stop the customer changing the clock to defeat the reminder / lock timing.
      UserManager.DISALLOW_CONFIG_DATE_TIME,
    )
    for (r in restrictions) {
      try { if (active) dpm.addUserRestriction(admin, r) else dpm.clearUserRestriction(admin, r) } catch (_: Exception) {}
    }

    var frpApplied = false
    val frpSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    if (frpSupported) {
      try {
        val builder = android.app.admin.FactoryResetProtectionPolicy.Builder()
          .setFactoryResetProtectionEnabled(active)
        if (frpAccounts.isNotEmpty()) builder.setFactoryResetProtectionAccounts(frpAccounts)
        val policy = builder.build()
        // Pass the policy to enable; null to clear when released.
        dpm.setFactoryResetProtectionPolicy(admin, if (active) policy else null)
        frpApplied = true
        // Best-effort nudge for GMS to sync the FRP state. Third-party apps
        // usually cannot deliver this protected broadcast, so it is guarded and
        // NOT relied upon — setFactoryResetProtectionPolicy is the real mechanism.
        try {
          context.sendBroadcast(
            Intent("com.google.android.gms.auth.FRP_CONFIG_CHANGED").setPackage("com.google.android.gms")
          )
        } catch (_: Exception) {}
      } catch (_: Exception) { frpApplied = false }
    }

    return mapOf(
      "applied" to true,
      "mode" to mode,
      "active" to active,
      "frpApplied" to frpApplied,
      "frpSupported" to frpSupported,
      "accountsConfigured" to frpAccounts.size,
      "sdkInt" to Build.VERSION.SDK_INT,
    )
  }

  /** Enter the kiosk (lock-task) on the foreground activity, if permitted. */
  private fun startKioskIfPermitted() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      try {
        if (dpm.isLockTaskPermitted(context.packageName)) activity.startLockTask()
      } catch (_: Exception) {}
    }
  }

  private fun stopKiosk() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      try { activity.stopLockTask() } catch (_: Exception) {}
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoTelepointDeviceManagement")

    AsyncFunction("isDeviceAdminEnabled") {
      dpm.isAdminActive(adminComponent)
    }

    AsyncFunction("isDeviceOwner") {
      isDeviceOwner()
    }

    // Opens the OS "activate device admin" dialog. Cannot grant by itself.
    AsyncFunction("requestDeviceAdmin") {
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
        putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
        putExtra(
          DevicePolicyManager.EXTRA_ADD_EXPLANATION,
          "TelePoint uses this permission to lock this financed device when your EMI is overdue. " +
            "The lock screen shows your amount due and store contact. You can remove it anytime in Settings."
        )
      }
      activity.startActivity(intent)
    }

    AsyncFunction("openDeviceAdminSettings") {
      val intent = Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    // The device's current management mode (see class doc).
    AsyncFunction("getManagementMode") {
      currentMode()
    }

    AsyncFunction("getDeviceManagementStatus") {
      val mode = currentMode()
      val adminActive = dpm.isAdminActive(adminComponent)
      val canLock = mode == "DEVICE_ADMIN" || mode == "DEVICE_OWNER"
      mapOf(
        "adminActive" to adminActive,
        "mode" to mode,
        "state" to if (adminActive) "ADMIN_ACTIVE" else "ADMIN_INACTIVE",
        "canLock" to canLock,
        // True only in DEVICE_OWNER: the hard, can't-self-unlock financing lock.
        "canEnforce" to (mode == "DEVICE_OWNER"),
        "enforcedLocked" to LockStateStore.isLocked(context)
      )
    }

    AsyncFunction("getDeviceInfo") {
      mapOf(
        "manufacturer" to (Build.MANUFACTURER ?: ""),
        "model" to (Build.MODEL ?: ""),
        "androidVersion" to (Build.VERSION.RELEASE ?: ""),
        "sdkInt" to Build.VERSION.SDK_INT
      )
    }

    // Re-assert the lock. Called on every foreground / poll while the account is
    // LOCKED so a single unlock does not defeat the lock. On DEVICE_OWNER it also
    // re-enters the kiosk; on DEVICE_ADMIN it is a soft screen lock only.
    AsyncFunction("lockNow") {
      val mode = currentMode()
      val canLock = mode == "DEVICE_ADMIN" || mode == "DEVICE_OWNER"
      if (!dpm.isAdminActive(adminComponent) || !canLock) return@AsyncFunction false
      if (mode == "DEVICE_OWNER" && LockStateStore.isLocked(context)) startKioskIfPermitted()
      try { dpm.lockNow(); true } catch (e: SecurityException) { false }
    }

    // Execute an authorised LOCK. On DEVICE_OWNER this engages the full
    // financing lock (kiosk + HOME takeover + uninstall/factory-reset block +
    // persisted state that survives reboot). On DEVICE_ADMIN it is a soft
    // screen lock (the user can still unlock with their PIN — reported honestly
    // via mode). Persisting the flag lets the boot receiver resume enforcement.
    AsyncFunction("executeAuthorizedLock") { commandId: String ->
      val mode = currentMode()
      val canLock = mode == "DEVICE_ADMIN" || mode == "DEVICE_OWNER"
      if (!dpm.isAdminActive(adminComponent)) {
        return@AsyncFunction mapOf("ok" to false, "commandId" to commandId, "reason" to "admin_inactive")
      }
      if (!canLock) {
        return@AsyncFunction mapOf("ok" to false, "commandId" to commandId, "reason" to "mode_unsupported:$mode")
      }
      try {
        LockStateStore.setLocked(context, true)
        WallpaperManagerHelper.setOverdueWallpaper(context)
        if (mode == "DEVICE_OWNER") {
          applyLockPolicies(true)
          startKioskIfPermitted()
        }
        dpm.lockNow()
        mapOf("ok" to true, "commandId" to commandId, "mode" to mode, "enforced" to (mode == "DEVICE_OWNER"))
      } catch (e: SecurityException) {
        mapOf("ok" to false, "commandId" to commandId, "reason" to "security_exception")
      }
    }

    // Execute an authorised UNLOCK. This is the ONLY path that releases the
    // lock, and it runs only when the backend (admin, after EMI is paid) has
    // issued an UNLOCK command — the customer has no unlock control anywhere.
    // On DEVICE_OWNER it exits the kiosk, restores the HOME launcher, and clears
    // the protective restrictions; the customer's own screen lock then applies.
    AsyncFunction("executeAuthorizedUnlock") { commandId: String ->
      if (!dpm.isAdminActive(adminComponent)) {
        return@AsyncFunction mapOf("ok" to false, "commandId" to commandId, "reason" to "admin_inactive")
      }
      val mode = currentMode()
      LockStateStore.setLocked(context, false)
      WallpaperManagerHelper.restoreCustomerWallpaper(context)
      if (mode == "DEVICE_OWNER") {
        stopKiosk()
        applyLockPolicies(false)
      }
      mapOf("ok" to true, "commandId" to commandId, "mode" to mode)
    }

    // Keep the app un-removable while the EMI is outstanding. DEVICE_OWNER only;
    // returns applied=false with a reason otherwise so the UI is honest.
    AsyncFunction("setUninstallProtection") { active: Boolean ->
      val mode = currentMode()
      if (mode != "DEVICE_OWNER") {
        return@AsyncFunction mapOf("applied" to false, "mode" to mode, "reason" to "requires_device_owner")
      }
      try {
        dpm.setUninstallBlocked(adminComponent, context.packageName, active)
        mapOf("applied" to true, "mode" to mode, "blocked" to active)
      } catch (e: Exception) {
        mapOf("applied" to false, "mode" to mode, "reason" to "exception")
      }
    }

    // Collateral protection tied to the LOAN being outstanding (Device Owner):
    // uninstall block + DISALLOW_FACTORY_RESET + DISALLOW_SAFE_BOOT +
    // DISALLOW_ADD_USER + Factory Reset Protection policy. `frpAccountsJson` is a
    // JSON array of account identifiers that may unlock the device after a wipe.
    // Applied while owing; call with active=false once the EMI is cleared.
    AsyncFunction("applyFinancingProtection") { active: Boolean, frpAccountsJson: String? ->
      applyFinancingProtection(active, parseFrpAccounts(frpAccountsJson))
    }

    // Report which collateral protections are actually in force right now, read
    // from the live user restrictions — so the UI never claims more than is true.
    AsyncFunction("getProtectionStatus") {
      val mode = currentMode()
      val um = context.getSystemService(Context.USER_SERVICE) as UserManager
      val r = um.userRestrictions
      mapOf(
        "mode" to mode,
        "factoryResetBlocked" to r.getBoolean(UserManager.DISALLOW_FACTORY_RESET, false),
        "safeBootBlocked" to r.getBoolean(UserManager.DISALLOW_SAFE_BOOT, false),
        "addUserBlocked" to r.getBoolean(UserManager.DISALLOW_ADD_USER, false),
        "frpSupported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R),
        "sdkInt" to Build.VERSION.SDK_INT,
      )
    }

    // --- SMS command channel (offline LOCK/UNLOCK) --------------------------
    // Configure the authorised sender numbers + this device's customer code so an
    // SMS "LOCK <code>" / "UNLOCK <code>" from an allowlisted number is honoured.
    AsyncFunction("configureSmsControl") { sendersCsv: String, customerCode: String ->
      SmsCommandStore.setConfig(context, sendersCsv, customerCode)
      mapOf("ok" to true, "configured" to SmsCommandStore.isConfigured(context))
    }

    AsyncFunction("isSmsControlConfigured") { SmsCommandStore.isConfigured(context) }

    // Device Owner can silently grant itself RECEIVE_SMS (managed device). On a
    // non-owner device this is a no-op with a reason (SMS control then requires a
    // manual runtime grant, which modern Android rarely allows for non-SMS apps).
    AsyncFunction("grantSmsPermissionIfOwner") {
      if (!isDeviceOwner()) return@AsyncFunction mapOf("granted" to false, "reason" to "requires_device_owner")
      try {
        for (p in listOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.SEND_SMS)) {
          dpm.setPermissionGrantState(adminComponent, context.packageName, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        }
        mapOf("granted" to true)
      } catch (e: Exception) {
        mapOf("granted" to false, "reason" to "exception")
      }
    }

    AsyncFunction("getSmsControlStatus") {
      val perm = context.checkSelfPermission(android.Manifest.permission.RECEIVE_SMS) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
      mapOf(
        "configured" to SmsCommandStore.isConfigured(context),
        "permissionGranted" to perm,
        "mode" to currentMode(),
      )
    }

    // --- Advanced device actions (Bajaj-style) ------------------------------
    // Stateful lock toggles. CAMERA works for DEVICE_ADMIN or DEVICE_OWNER; all
    // the user-restriction toggles are DEVICE_OWNER only. `enabled=true` LOCKS
    // (restricts) the feature; false releases it. Honest reason on refusal.
    AsyncFunction("setDevicePolicy") { policy: String, enabled: Boolean ->
      val mode = currentMode()
      val admin = adminComponent
      if (policy == "CAMERA") {
        if (!dpm.isAdminActive(admin)) return@AsyncFunction mapOf("applied" to false, "reason" to "admin_inactive", "mode" to mode)
        return@AsyncFunction try {
          dpm.setCameraDisabled(admin, enabled)
          mapOf("applied" to true, "policy" to policy, "enabled" to enabled, "mode" to mode)
        } catch (e: Exception) { mapOf("applied" to false, "reason" to "exception", "mode" to mode) }
      }
      if (mode != "DEVICE_OWNER") return@AsyncFunction mapOf("applied" to false, "reason" to "requires_device_owner", "mode" to mode)
      val restriction = when (policy) {
        "BLUETOOTH" -> UserManager.DISALLOW_BLUETOOTH
        "WIFI" -> UserManager.DISALLOW_CONFIG_WIFI
        "USB" -> UserManager.DISALLOW_USB_FILE_TRANSFER
        "AIRPLANE" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) UserManager.DISALLOW_AIRPLANE_MODE else null
        "OUTGOING_CALLS" -> UserManager.DISALLOW_OUTGOING_CALLS
        "WALLPAPER" -> UserManager.DISALLOW_SET_WALLPAPER
        else -> null
      } ?: return@AsyncFunction mapOf("applied" to false, "reason" to "unsupported_policy", "mode" to mode)
      try {
        if (enabled) dpm.addUserRestriction(admin, restriction) else dpm.clearUserRestriction(admin, restriction)
        mapOf("applied" to true, "policy" to policy, "enabled" to enabled, "mode" to mode)
      } catch (e: Exception) { mapOf("applied" to false, "reason" to "exception", "mode" to mode) }
    }

    // Live state of each toggle, read from the OS — so the panel never guesses.
    AsyncFunction("getDevicePolicies") {
      val um = context.getSystemService(Context.USER_SERVICE) as UserManager
      val r = um.userRestrictions
      val cam = try { dpm.getCameraDisabled(adminComponent) } catch (e: Exception) { false }
      mapOf(
        "mode" to currentMode(),
        "camera" to cam,
        "bluetooth" to r.getBoolean(UserManager.DISALLOW_BLUETOOTH, false),
        "wifi" to r.getBoolean(UserManager.DISALLOW_CONFIG_WIFI, false),
        "usb" to r.getBoolean(UserManager.DISALLOW_USB_FILE_TRANSFER, false),
        "airplane" to r.getBoolean(UserManager.DISALLOW_AIRPLANE_MODE, false),
        "outgoingCalls" to r.getBoolean(UserManager.DISALLOW_OUTGOING_CALLS, false),
        "wallpaper" to r.getBoolean(UserManager.DISALLOW_SET_WALLPAPER, false),
      )
    }

    // Reboot — Device Owner only (API 24+). May throw if a call is active.
    AsyncFunction("rebootDevice") {
      if (currentMode() != "DEVICE_OWNER") return@AsyncFunction mapOf("ok" to false, "reason" to "requires_device_owner")
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return@AsyncFunction mapOf("ok" to false, "reason" to "unsupported_version")
      try { dpm.reboot(adminComponent); mapOf("ok" to true) } catch (e: Exception) { mapOf("ok" to false, "reason" to "exception") }
    }

    // Hide/unhide another app — Device Owner only.
    AsyncFunction("setApplicationHidden") { packageName: String, hidden: Boolean ->
      if (currentMode() != "DEVICE_OWNER") return@AsyncFunction mapOf("applied" to false, "reason" to "requires_device_owner")
      try {
        val ok = dpm.setApplicationHidden(adminComponent, packageName, hidden)
        mapOf("applied" to ok)
      } catch (e: Exception) { mapOf("applied" to false, "reason" to "exception") }
    }

    // --- Wi-Fi / Airplane power ---------------------------------------------
    // Wi-Fi ON/OFF. A Device Owner may toggle Wi-Fi on ALL versions; a normal
    // app only up to Android 9 (API 28). Honest reason otherwise.
    AsyncFunction("setWifiEnabled") { enabled: Boolean ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !isDeviceOwner()) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "requires_device_owner")
      }
      try {
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        val ok = wm.setWifiEnabled(enabled)
        mapOf("ok" to ok, "enabled" to enabled)
      } catch (e: SecurityException) { mapOf("ok" to false, "reason" to "security_exception") }
      catch (e: Exception) { mapOf("ok" to false, "reason" to "exception") }
    }

    // Airplane ON/OFF — ATTEMPT ONLY. Modern Android does not let any app
    // (even Device Owner) toggle airplane mode; setGlobalSetting dropped the key.
    // We attempt it and report the TRUE result (usually ok=false on new devices)
    // rather than pretend. The reliable control is the Airplane Mode Lock.
    AsyncFunction("setAirplaneMode") { enabled: Boolean ->
      if (!isDeviceOwner()) return@AsyncFunction mapOf("ok" to false, "reason" to "requires_device_owner")
      try {
        dpm.setGlobalSetting(adminComponent, Settings.Global.AIRPLANE_MODE_ON, if (enabled) "1" else "0")
        mapOf("ok" to true, "enabled" to enabled)
      } catch (e: Exception) {
        mapOf("ok" to false, "reason" to "unsupported_on_this_android")
      }
    }

    // --- Location + SIM information -----------------------------------------
    // Device Owner silently grants itself the location + phone runtime perms so
    // the on-demand fetch works. No-op with a reason on a non-owner device.
    AsyncFunction("grantLocationSimPermissionsIfOwner") {
      if (!isDeviceOwner()) return@AsyncFunction mapOf("granted" to false, "reason" to "requires_device_owner")
      val perms = mutableListOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_PHONE_NUMBERS,
      )
      // Background location (Android 10+): needed to read location while the app
      // is backgrounded (tracking). Device Owner grants it silently, bypassing
      // the Android 11 two-step Settings dialog.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) perms.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
      // Notifications (Android 13+): grant so EMI reminders are not silently off.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) perms.add(Manifest.permission.POST_NOTIFICATIONS)
      var granted = 0
      for (p in perms) {
        try {
          dpm.setPermissionGrantState(adminComponent, context.packageName, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
          granted += 1
        } catch (_: Exception) {}
      }
      mapOf("granted" to true, "count" to granted)
    }

    // Best last-known location across providers (freshest). Honest reason if the
    // permission is denied or no fix is available.
    AsyncFunction("getLocation") {
      val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
      if (!fine && !coarse) return@AsyncFunction mapOf("ok" to false, "reason" to "permission_denied")
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      var best: Location? = null
      for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
        try {
          val loc = lm.getLastKnownLocation(p) ?: continue
          if (best == null || loc.time > best!!.time) best = loc
        } catch (_: SecurityException) {} catch (_: Exception) {}
      }
      val b = best ?: return@AsyncFunction mapOf("ok" to false, "reason" to "no_location")
      mapOf(
        "ok" to true,
        "lat" to b.latitude,
        "lng" to b.longitude,
        "accuracy" to b.accuracy.toDouble(),
        "provider" to (b.provider ?: ""),
        "time" to b.time,
      )
    }

    // Active SIM information (carrier / number / slot). Requires READ_PHONE_STATE
    // (number also needs READ_PHONE_NUMBERS). Honest reason if denied.
    AsyncFunction("getSimInfo") {
      if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "permission_denied")
      }
      val sims = ArrayList<Map<String, Any?>>()
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
          val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
          val list = try { sm.activeSubscriptionInfoList } catch (_: SecurityException) { null }
          list?.forEach { info ->
            sims.add(mapOf(
              "slot" to info.simSlotIndex,
              "carrier" to (info.carrierName?.toString() ?: ""),
              "display" to (info.displayName?.toString() ?: ""),
              "number" to (try { info.number ?: "" } catch (_: Exception) { "" }),
            ))
          }
        }
      } catch (_: Exception) {}
      mapOf("ok" to true, "count" to sims.size, "sims" to sims)
    }

    // --- App hide-all + tracking + full release -----------------------------
    // Hide/unhide every user-installed launchable app except TelePoint (EMI-only).
    AsyncFunction("hideAllUserApps") { hide: Boolean ->
      val n = DeviceActions.hideAllUserApps(context, hide)
      if (n < 0) mapOf("applied" to false, "reason" to "requires_device_owner")
      else mapOf("applied" to true, "count" to n)
    }

    // Location + SIM tracking flag (read each sync pass by the app).
    AsyncFunction("setTrackingEnabled") { enabled: Boolean ->
      TrackingStore.setEnabled(context, enabled)
      mapOf("ok" to true, "enabled" to enabled)
    }
    AsyncFunction("isTrackingEnabled") { TrackingStore.isEnabled(context) }

    // FULL RELEASE once the loan is closed — the legal end of financer control.
    // Exits kiosk, clears factory-reset/safe-boot/FRP/uninstall protection, clears
    // every managed restriction, unhides apps, and clears lock + tracking flags.
    AsyncFunction("releaseManagedRestrictions") {
      val mode = currentMode()
      if (mode == "DEVICE_OWNER") {
        stopKiosk()
        applyLockPolicies(false)
        applyFinancingProtection(false, emptyList())
      }
      DeviceActions.releaseManagedRestrictions(context)
      mapOf("ok" to true, "mode" to mode)
    }

    // --- SIM sentinel provisioning ------------------------------------------
    AsyncFunction("configureSimSentinel") { alertNumbersCsv: String ->
      SimSentinelStore.setAlertNumbers(context, alertNumbersCsv)
      mapOf("ok" to true)
    }
    // Baseline the enrolled SIM ONCE (won't overwrite, so a later swap is still
    // detected). Pass force=true to re-baseline after a legitimate SIM change.
    AsyncFunction("setSimBaseline") { force: Boolean ->
      if (!force && !SimSentinelStore.getBaseline(context).isNullOrBlank()) {
        return@AsyncFunction mapOf("ok" to true, "already" to true)
      }
      val sig = currentSimSignature() ?: return@AsyncFunction mapOf("ok" to false, "reason" to "no_sim_or_permission")
      SimSentinelStore.setBaseline(context, sig)
      mapOf("ok" to true, "signature" to sig)
    }

    // --- OEM autostart (MIUI/Vivo/Oppo/…) -----------------------------------
    AsyncFunction("openOemAutostartSettings") {
      mapOf("opened" to OemPermissionHelper.openOemAutostartSettings(context))
    }

    // --- Per-app lock (Device Owner suspend; no Accessibility) --------------
    AsyncFunction("setAppsSuspended") { packagesJson: String, suspended: Boolean ->
      if (currentMode() != "DEVICE_OWNER") return@AsyncFunction mapOf("applied" to false, "reason" to "requires_device_owner")
      val pkgs = parseFrpAccounts(packagesJson) // reuse JSON-array/CSV parser
      if (pkgs.isEmpty()) return@AsyncFunction mapOf("applied" to false, "reason" to "no_packages")
      try {
        val failed = dpm.setPackagesSuspended(adminComponent, pkgs.toTypedArray(), suspended)
        mapOf("applied" to true, "suspended" to suspended, "failed" to failed.toList())
      } catch (e: Exception) { mapOf("applied" to false, "reason" to "exception") }
    }

    // Whether the app is already exempt from battery optimization. Unrestricted
    // battery lets the background command delivery + EMI reminders keep running
    // when the app is closed, instead of being throttled/killed by Doze.
    AsyncFunction("isIgnoringBatteryOptimizations") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@AsyncFunction true
      val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    // Open the OS dialog asking the user to allow unrestricted battery for this
    // app. Requires an explicit user tap in the system UI — this cannot grant it
    // silently. Falls back to the battery-optimization settings list.
    AsyncFunction("requestIgnoreBatteryOptimizations") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@AsyncFunction mapOf("requested" to false, "reason" to "not_needed")
      }
      val pkg = context.packageName
      val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
      if (pm.isIgnoringBatteryOptimizations(pkg)) {
        return@AsyncFunction mapOf("requested" to false, "alreadyGranted" to true)
      }
      try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = android.net.Uri.parse("package:$pkg")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        mapOf("requested" to true)
      } catch (e: Exception) {
        try {
          context.startActivity(
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
          mapOf("requested" to true, "fallback" to true)
        } catch (e2: Exception) {
          mapOf("requested" to false, "reason" to "unavailable")
        }
      }
    }

    // Open the connectivity panel so the customer can turn ON Wi-Fi / mobile data
    // from the locked screen (needed to receive the UNLOCK).
    AsyncFunction("openInternetPanel") {
      try {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
          Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY)
        else
          Intent(Settings.ACTION_WIRELESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        mapOf("opened" to true)
      } catch (e: Exception) {
        try {
          context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          mapOf("opened" to true, "fallback" to true)
        } catch (e2: Exception) {
          mapOf("opened" to false)
        }
      }
    }
  }

  private fun currentMode(): String {
    return when {
      dpm.isDeviceOwnerApp(context.packageName) -> "DEVICE_OWNER"
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
        dpm.isProfileOwnerApp(context.packageName) -> "PROFILE_OWNER"
      dpm.isAdminActive(adminComponent) -> "DEVICE_ADMIN"
      else -> "UNMANAGED"
    }
  }

  /** Signature of the SIM in slot 0 (ICCID if readable, else sub+carrier). */
  private fun currentSimSignature(): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) return null
    if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return null
    val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
    val list = try { sm.activeSubscriptionInfoList } catch (_: Exception) { null } ?: return null
    if (list.isEmpty()) return null
    val sub = list.firstOrNull { it.simSlotIndex == 0 } ?: list.first()
    val icc = try { sub.iccId ?: "" } catch (_: Exception) { "" }
    return if (icc.isNotBlank()) "icc:$icc" else "sub:${sub.subscriptionId}:${sub.carrierName ?: ""}"
  }
}
