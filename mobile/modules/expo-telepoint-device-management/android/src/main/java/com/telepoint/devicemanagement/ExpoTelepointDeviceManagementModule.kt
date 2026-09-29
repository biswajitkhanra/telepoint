package com.telepoint.devicemanagement

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.UserManager
import android.provider.Settings
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
   * The full, persistent policy set that makes an EMI lock real collateral
   * protection. Device Owner only — a no-op otherwise, by Android design.
   *   • whitelist self for lock-task (kiosk with no user confirmation)
   *   • block uninstall of the collateral app
   *   • while locked: block factory reset, safe boot and adding users so the
   *     lock cannot be trivially wiped
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

    try {
      dpm.setUninstallBlocked(admin, pkg, active)
    } catch (_: Exception) {}

    val restrictions = listOf(
      UserManager.DISALLOW_FACTORY_RESET,
      UserManager.DISALLOW_SAFE_BOOT,
      UserManager.DISALLOW_ADD_USER
    )
    for (r in restrictions) {
      try {
        if (active) dpm.addUserRestriction(admin, r) else dpm.clearUserRestriction(admin, r)
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
}
