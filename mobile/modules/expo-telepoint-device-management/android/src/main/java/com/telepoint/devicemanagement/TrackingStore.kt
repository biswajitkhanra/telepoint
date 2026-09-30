package com.telepoint.devicemanagement

import android.content.Context

/**
 * Whether periodic location + SIM tracking is enabled for this device. Set by an
 * admin action (online) or an SMS `TRACK ON/OFF` command (offline). Read by the
 * app each sync pass to decide whether to report the device's location + SIM.
 */
object TrackingStore {
  private const val PREFS = "telepoint_tracking"
  private const val KEY = "tracking_enabled"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun isEnabled(c: Context): Boolean = prefs(c).getBoolean(KEY, false)
  fun setEnabled(c: Context, enabled: Boolean) { prefs(c).edit().putBoolean(KEY, enabled).apply() }
}
