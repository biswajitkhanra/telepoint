package com.telepoint.devicemanagement

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.UserManager

/**
 * Shared, activity-free device-policy actions used by BOTH the SMS receiver
 * (offline) and the Expo module (online). Centralised so the two control paths
 * never drift. Everything uses documented DevicePolicyManager APIs; Device Owner
 * is required for the user-restriction actions and app hide (Camera works under
 * Device Admin too). Honest booleans on success/failure — nothing faked.
 */
object DeviceActions {
  fun dpm(c: Context) = c.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
  fun admin(c: Context) = ComponentName(c, TelepointDeviceAdminReceiver::class.java)
  fun isOwner(c: Context) = dpm(c).isDeviceOwnerApp(c.packageName)

  private fun launchApp(c: Context) {
    try {
      val launch = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: return
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      c.startActivity(launch)
    } catch (_: Exception) {}
  }

  /** Lock the device: persist the flag (survives reboot), secure the screen,
   *  set the branded overdue wallpaper, and bring up the TelePoint lock screen. */
  fun hardLock(c: Context) {
    LockStateStore.setLocked(c, true)
    try { if (dpm(c).isAdminActive(admin(c))) dpm(c).lockNow() } catch (_: Exception) {}
    WallpaperManagerHelper.setOverdueWallpaper(c)
    launchApp(c)
  }

  /** Release the lock: clear the flag and restore the customer's wallpaper. */
  fun releaseLock(c: Context) {
    LockStateStore.setLocked(c, false)
    WallpaperManagerHelper.restoreCustomerWallpaper(c)
  }

  /**
   * Hide (or unhide) every user-installed, launchable third-party app except
   * TelePoint — so a locked/financed device shows only the EMI app. System apps
   * (phone, settings) are left usable. Device Owner only. Returns count changed,
   * or -1 when not permitted. (Device Owner is exempt from package-visibility
   * filtering, so no QUERY_ALL_PACKAGES is needed.)
   */
  fun hideAllUserApps(c: Context, hide: Boolean): Int {
    if (!isOwner(c)) return -1
    val d = dpm(c); val a = admin(c)
    val pm = c.packageManager
    val self = c.packageName
    var count = 0
    val apps = try { pm.getInstalledApplications(0) } catch (_: Exception) { emptyList<ApplicationInfo>() }
    for (app in apps) {
      val p = app.packageName ?: continue
      if (p == self) continue
      if ((app.flags and ApplicationInfo.FLAG_SYSTEM) != 0) continue        // keep system apps usable
      if (pm.getLaunchIntentForPackage(p) == null) continue                  // only launchable apps
      try { if (d.setApplicationHidden(a, p, hide)) count += 1 } catch (_: Exception) {}
    }
    return count
  }

  /**
   * Full release once the loan is closed: clear camera + every managed user
   * restriction, unhide all apps, and clear the local lock + tracking flags. The
   * kiosk / factory-reset / FRP release is done by the module (needs the activity
   * / financing-protection call). Legal intent: the financer controls the device
   * ONLY until the EMI is fully paid, then everything is released.
   */
  fun releaseManagedRestrictions(c: Context) {
    val d = dpm(c); val a = admin(c)
    try { if (d.isAdminActive(a)) d.setCameraDisabled(a, false) } catch (_: Exception) {}
    if (isOwner(c)) {
      for (r in listOf(
        UserManager.DISALLOW_BLUETOOTH,
        UserManager.DISALLOW_CONFIG_WIFI,
        UserManager.DISALLOW_USB_FILE_TRANSFER,
        UserManager.DISALLOW_AIRPLANE_MODE,
        UserManager.DISALLOW_OUTGOING_CALLS,
        UserManager.DISALLOW_SET_WALLPAPER,
      )) {
        try { d.clearUserRestriction(a, r) } catch (_: Exception) {}
      }
      hideAllUserApps(c, false)
    }
    LockStateStore.setLocked(c, false)
    TrackingStore.setEnabled(c, false)
    SimSentinelStore.clear(c)
    WallpaperManagerHelper.restoreCustomerWallpaper(c)
  }
}
