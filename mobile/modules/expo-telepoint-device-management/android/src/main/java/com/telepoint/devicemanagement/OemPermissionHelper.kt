package com.telepoint.devicemanagement

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Opens the OEM "autostart / background start" manager and the "background
 * pop-up windows" permission screens on aggressive Chinese ROMs (Xiaomi/MIUI/
 * HyperOS, Vivo/Funtouch, Oppo/Realme/OnePlus/ColorOS, Transsion/Infinix/Tecno,
 * Huawei/EMUI). These killers terminate background work and block the lock-
 * screen overlay regardless of the standard battery-optimisation exemption,
 * so the store must grant "Autostart" AND "Background pop-up windows" once.
 * Falls back to the app details settings.
 */
object OemPermissionHelper {
  fun openOemAutostartSettings(context: Context): Boolean {
    val m = Build.MANUFACTURER.lowercase()
    val candidates = mutableListOf<Intent>()

    fun add(pkg: String, cls: String) {
      candidates.add(Intent().setComponent(ComponentName(pkg, cls)))
    }

    when {
      m.contains("xiaomi") || m.contains("redmi") || m.contains("poco") ->
        add("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
      m.contains("vivo") || m.contains("iqoo") -> {
        add("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")
        add("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
      }
      m.contains("oppo") || m.contains("realme") || m.contains("oneplus") -> {
        add("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")
        add("com.oplus.battery", "com.oplus.battery.startup.StartupAppListActivity")
      }
      m.contains("transsion") || m.contains("infinix") || m.contains("tecno") ->
        add("com.transsion.phonemaster", "com.transsion.phonemaster.MainActivity")
      m.contains("huawei") || m.contains("honor") ->
        add("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
    }

    return openFirst(context, candidates)
  }

  /**
   * "Background pop-up windows" (display over other apps while backgrounded) —
   * REQUIRED on Vivo/Funtouch and MIUI/HyperOS for the instant lock screen.
   * Opens the per-app pop-up permission page; falls back to app details.
   */
  fun openOemBackgroundPopups(context: Context): Boolean {
    val m = Build.MANUFACTURER.lowercase()
    val candidates = mutableListOf<Intent>()
    val pkg = context.packageName

    when {
      m.contains("vivo") || m.contains("iqoo") -> {
        candidates.add(
          Intent("com.vivo.permissionmanager.action.OPEN_SOFT_DETAIL")
            .setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.SoftPermissionDetailActivity")
            .putExtra("packagename", pkg).putExtra("packageName", pkg),
        )
      }
      m.contains("xiaomi") || m.contains("redmi") || m.contains("poco") -> {
        candidates.add(
          Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.permissions.AppPermissionsEditorActivity"))
            .putExtra("extra_pkgname", pkg),
        )
      }
      m.contains("huawei") || m.contains("honor") -> {
        candidates.add(
          Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity")),
        )
      }
    }

    return openFirst(context, candidates)
  }

  private fun openFirst(context: Context, candidates: List<Intent>): Boolean {
    for (intent in candidates) {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        if (context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null) {
          context.startActivity(intent)
          return true
        }
      } catch (_: Exception) {}
    }

    // Fallback: the battery-optimization LIST (not our own App Info page — the
    // accessibility service bounces our App Info screen as a tamper attempt).
    try {
      context.startActivity(
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    } catch (_: Exception) {}
    return false
  }
}
