package com.telepoint.devicemanagement

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Opens the OEM "autostart / background start" manager on aggressive Chinese
 * ROMs (Xiaomi/MIUI/HyperOS, Vivo/Funtouch, Oppo/Realme/OnePlus/ColorOS,
 * Transsion/Infinix/Tecno). These killers terminate background work regardless
 * of the standard battery-optimisation exemption, so the store must grant
 * "Autostart" once. Falls back to the app details settings.
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
    }

    for (intent in candidates) {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        if (context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null) {
          context.startActivity(intent)
          return true
        }
      } catch (_: Exception) {}
    }

    // Fallback: this app's details settings (where autostart/battery live on stock).
    try {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.fromParts("package", context.packageName, null))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    } catch (_: Exception) {}
    return false
  }
}
