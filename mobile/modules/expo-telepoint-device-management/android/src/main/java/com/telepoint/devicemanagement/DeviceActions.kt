package com.telepoint.devicemanagement

import android.app.admin.DevicePolicyManager
import android.bluetooth.BluetoothAdapter
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings

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

  /** Bring the TelePoint app to the front (used by the lock and by the
   *  accessibility deterrent, which runs from a Service context). */
  fun launchApp(c: Context) {
    try {
      val launch = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: return
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      c.startActivity(launch)
    } catch (_: Exception) {}
  }

  /** Lock the device: persist the flag (survives reboot), secure the screen,
   *  apply the kiosk/HOME-takeover policies, set the branded overdue wallpaper,
   *  and bring up the TelePoint lock screen. Shared by the offline SMS path, the
   *  SIM sentinel and the native background service, so a lock is identical
   *  whether it arrives online or offline. */
  fun hardLock(c: Context) {
    LockStateStore.setLocked(c, true)
    try { if (dpm(c).isAdminActive(admin(c))) dpm(c).lockNow() } catch (_: Exception) {}
    try { LockPolicies.apply(c, true) } catch (_: Exception) {}
    WallpaperManagerHelper.setOverdueWallpaper(c)
    // Pop the full-screen lock cover IMMEDIATELY over whatever is on screen
    // (Display-over-other-apps); falls back to launching the app if not granted.
    TelepointOverlay.show(c, "lock", "Device Locked", "EMI payment required", null)
    launchApp(c)
  }

  /** Release the lock: clear the flag, drop the kiosk policies and restore the
   *  customer's wallpaper. Stamps the unlock watermark so stale LOCK commands
   *  issued before this moment never re-lock the phone (unlock always wins). */
  fun releaseLock(c: Context) {
    LockStateStore.setLocked(c, false)
    LockStateStore.setLastUnlockedAt(c, System.currentTimeMillis())
    try { LockPolicies.apply(c, false) } catch (_: Exception) {}
    WallpaperManagerHelper.restoreCustomerWallpaper(c)
    TelepointOverlay.dismiss(c)
  }

  /**
   * Airplane power (honest, best-effort). Modern Android (API 29+) blocks the
   * global toggle even for Device Owner, so try, in order: the Device Policy
   * global setting, the hidden ConnectivityManager#setAirplaneMode via
   * reflection, and finally a per-radio fallback (Wi-Fi + mobile data +
   * Bluetooth). Returns which method worked, or "unsupported".
   */
  fun setAirplaneMode(c: Context, enabled: Boolean): String {
    try {
      dpm(c).setGlobalSetting(admin(c), Settings.Global.AIRPLANE_MODE_ON, if (enabled) "1" else "0")
      return "global"
    } catch (_: Exception) {}
    try {
      val cm = c.getSystemService(Context.CONNECTIVITY_SERVICE)
      val m = cm.javaClass.getMethod("setAirplaneMode", java.lang.Boolean.TYPE)
      m.invoke(cm, enabled)
      return "reflection"
    } catch (_: Exception) {}
    var radios = false
    try {
      val wm = c.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION") wm.setWifiEnabled(!enabled)
      radios = true
    } catch (_: Exception) {}
    try {
      val bm = BluetoothAdapter.getDefaultAdapter()
      if (bm != null) { if (enabled) bm.disable() else bm.enable() }
      radios = true
    } catch (_: Exception) {}
    try {
      val tm = c.getSystemService(Context.TELEPHONY_SERVICE)
      val m = tm.javaClass.getMethod("setDataEnabled", java.lang.Boolean.TYPE)
      m.invoke(tm, !enabled)
      radios = true
    } catch (_: Exception) {}
    return if (radios) "radio_fallback" else "unsupported"
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
    val flags = if (hide) 0 else PackageManager.MATCH_UNINSTALLED_PACKAGES
    val apps = try { pm.getInstalledApplications(flags) } catch (_: Exception) { emptyList<ApplicationInfo>() }
    for (app in apps) {
      val p = app.packageName ?: continue
      if (p == self) continue
      if ((app.flags and ApplicationInfo.FLAG_SYSTEM) != 0) continue        // keep system apps usable
      if (hide && pm.getLaunchIntentForPackage(p) == null) continue
      if (!hide && !d.isApplicationHidden(a, p)) continue
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
  fun releaseManagedRestrictions(c: Context): Boolean {
    val d = dpm(c); val a = admin(c)
    var success = true
    try { if (d.isAdminActive(a)) d.setCameraDisabled(a, false) } catch (_: Exception) { success = false }
    if (isOwner(c)) {
      for (r in listOf(
        UserManager.DISALLOW_BLUETOOTH,
        UserManager.DISALLOW_CONFIG_WIFI,
        UserManager.DISALLOW_USB_FILE_TRANSFER,
        UserManager.DISALLOW_AIRPLANE_MODE,
        UserManager.DISALLOW_OUTGOING_CALLS,
        UserManager.DISALLOW_SET_WALLPAPER,
      )) {
        try { d.clearUserRestriction(a, r) } catch (_: Exception) { success = false }
      }
      try {
        val apps = c.packageManager.getInstalledApplications(PackageManager.MATCH_UNINSTALLED_PACKAGES)
        for (app in apps) {
          if (d.isApplicationHidden(a, app.packageName) && !d.setApplicationHidden(a, app.packageName, false)) success = false
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && d.isPackageSuspended(a, app.packageName)) {
            if (d.setPackagesSuspended(a, arrayOf(app.packageName), false).isNotEmpty()) success = false
          }
        }
      } catch (_: Exception) { success = false }
    }
    LockStateStore.setLocked(c, false)
    TrackingStore.setEnabled(c, false)
    SimSentinelStore.clear(c)
    WallpaperManagerHelper.restoreCustomerWallpaper(c)
    SmsCommandStore.clear(c)
    AppLockStore.clear(c)
    TelepointOverlay.dismiss(c)
    // End the accessibility deterrent as part of the full release.
    try { TelepointAccessibilityService.disableBestEffort(c) } catch (_: Exception) {}
    return success
  }
}
