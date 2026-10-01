package com.telepoint.devicemanagement

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.UserManager

/**
 * Kiosk/lock-state policies (Device Owner only), shared by the Expo module and
 * the background command service so both apply the exact same lock. Deliberately
 * context-only (no Activity), so it can run from a service with the app closed.
 *
 *   • whitelist self for lock-task (kiosk with no user confirmation)
 *   • while locked: make this app the HOME launcher so a reboot lands on the
 *     lock screen; cleared on release
 */
object LockPolicies {
  fun apply(c: Context, active: Boolean) {
    val d = DeviceActions.dpm(c)
    if (!d.isDeviceOwnerApp(c.packageName)) return
    val admin = DeviceActions.admin(c)
    val pkg = c.packageName

    try {
      d.setLockTaskPackages(admin, if (active) arrayOf(pkg) else arrayOf())
    } catch (_: Exception) {}

    // Call lock: while the device is locked, block outgoing calls (Device Owner
    // restriction). Emergency numbers stay reachable. Cleared on unlock/release.
    try {
      if (active) d.addUserRestriction(admin, UserManager.DISALLOW_OUTGOING_CALLS)
      else d.clearUserRestriction(admin, UserManager.DISALLOW_OUTGOING_CALLS)
    } catch (_: Exception) {}

    // While kiosked, still let the customer reach the notification shade / quick
    // settings + power menu so they can turn ON Wi-Fi / mobile data (needed for
    // the phone to receive the UNLOCK). HOME is deliberately NOT allowed, so they
    // cannot leave the lock screen.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        d.setLockTaskFeatures(
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

    val launcher = c.packageManager.getLaunchIntentForPackage(pkg)?.component
    if (launcher != null) {
      try {
        if (active) {
          val filter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
          }
          d.addPersistentPreferredActivity(admin, filter, launcher)
        } else {
          d.clearPackagePersistentPreferredActivities(admin, pkg)
        }
      } catch (_: Exception) {}
    }
  }
}
