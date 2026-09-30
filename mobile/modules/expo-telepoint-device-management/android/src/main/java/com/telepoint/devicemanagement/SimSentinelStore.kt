package com.telepoint.devicemanagement

import android.content.Context

/**
 * Baseline for the SIM sentinel: the signature of the SIM the device was
 * enrolled with, and the full financer numbers to alert on a SIM swap. Set at
 * provisioning; cleared on loan closure. When no baseline exists the sentinel is
 * dormant (does nothing).
 */
object SimSentinelStore {
  private const val PREFS = "telepoint_sim_guard"
  private const val KEY_BASELINE = "baseline_sim_signature"
  private const val KEY_ALERTS = "alert_numbers"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun getBaseline(c: Context): String? = prefs(c).getString(KEY_BASELINE, null)
  fun setBaseline(c: Context, sig: String?) {
    val e = prefs(c).edit()
    if (sig.isNullOrBlank()) e.remove(KEY_BASELINE) else e.putString(KEY_BASELINE, sig)
    e.apply()
  }

  fun getAlertNumbers(c: Context): List<String> {
    val raw = prefs(c).getString(KEY_ALERTS, "") ?: ""
    return raw.split(',', ';').map { it.trim() }.filter { it.isNotEmpty() }
  }
  fun setAlertNumbers(c: Context, csv: String) {
    prefs(c).edit().putString(KEY_ALERTS, csv).apply()
  }

  fun clear(c: Context) { prefs(c).edit().remove(KEY_BASELINE).apply() }
}
