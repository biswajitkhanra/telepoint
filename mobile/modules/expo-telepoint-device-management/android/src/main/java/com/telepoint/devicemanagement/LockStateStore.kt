package com.telepoint.devicemanagement

import android.content.Context

/**
 * Tiny persisted flag recording whether the financed device is currently under
 * an EMI lock. It lives in SharedPreferences (survives app kill and reboot) so
 * the boot receiver and the re-assert logic know the enforced state WITHOUT a
 * network call — the customer cannot clear it, and only an authorised backend
 * UNLOCK (relayed by the app) flips it off.
 *
 * The lock is server-authoritative; this flag is a local cache of the last
 * server-confirmed state so enforcement can resume immediately after a reboot,
 * before the app has a chance to reach the network.
 */
object LockStateStore {
  private const val PREFS = "telepoint_emi_lock"
  private const val KEY_LOCKED = "emi_locked"

  fun isLocked(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_LOCKED, false)

  fun setLocked(context: Context, locked: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_LOCKED, locked)
      .apply()
  }
}
