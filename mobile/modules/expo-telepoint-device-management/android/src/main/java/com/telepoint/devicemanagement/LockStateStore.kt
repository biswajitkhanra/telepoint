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
  private const val KEY_UNINSTALL_PROTECTED = "uninstall_protected"
  private const val KEY_LAST_UNLOCKED_AT = "last_unlocked_at"
  // Monotonic-clock unlock watermark (SystemClock.elapsedRealtime) — immune to
  // user wall-clock changes; compared against the SERVER's clock via server_now.
  private const val KEY_LAST_UNLOCK_ELAPSED = "last_unlocked_elapsed"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isLocked(context: Context): Boolean =
    prefs(context).getBoolean(KEY_LOCKED, false)

  fun setLocked(context: Context, locked: Boolean) {
    prefs(context).edit().putBoolean(KEY_LOCKED, locked).apply()
  }

  /**
   * Whether uninstall/admin-removal should be blocked. True while the EMI is
   * still outstanding (the financing agreement); set to false once the loan is
   * COMPLETE/SETTLED so the customer can freely remove the app. Defaults to true
   * so a financed device is protected until the app confirms the loan is clear.
   */
  fun isUninstallProtected(context: Context): Boolean =
    prefs(context).getBoolean(KEY_UNINSTALL_PROTECTED, true)

  fun setUninstallProtected(context: Context, protected: Boolean) {
    prefs(context).edit().putBoolean(KEY_UNINSTALL_PROTECTED, protected).apply()
  }

  /**
   * Unlock-wins watermark: the last time the device was unlocked (backend
   * UNLOCK, offline TOTP code, or offline SMS UNLOCK). Any LOCK command issued
   * BEFORE this moment is stale and must be acked SUPERSEDED instead of
   * re-locking the phone — so an offline unlock always sticks even when the
   * server has not been updated yet. A LOCK issued AFTER it still executes.
   */
  fun getLastUnlockedAt(context: Context): Long =
    prefs(context).getLong(KEY_LAST_UNLOCKED_AT, 0L)

  fun setLastUnlockedAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_UNLOCKED_AT, at).apply()
  }

  /** Monotonic elapsed-realtime timestamp of the last unlock (clock-skew safe). */
  fun getLastUnlockElapsed(context: Context): Long =
    prefs(context).getLong(KEY_LAST_UNLOCK_ELAPSED, 0L)

  fun setLastUnlockElapsed(context: Context, elapsed: Long) {
    prefs(context).edit().putLong(KEY_LAST_UNLOCK_ELAPSED, elapsed).apply()
  }

  /**
   * Stale-LOCK check: is `commandCreatedMs` (server wall-clock) on or before the
   * moment of the last unlock, expressed in SERVER time? Computed as
   * serverNowMs − (elapsedRealtime() − lastUnlockElapsed), so a customer moving
   * the device clock ahead or back cannot void or re-arm genuine locks.
   * On any unreadable state this returns TRUE (when in doubt, do NOT re-lock).
   */
  fun isLockStale(context: Context, commandCreatedMs: Long, serverNowMs: Long): Boolean {
    // Cannot prove the command is fresh (unparseable date / missing server_now)
    // → do NOT re-lock: unlock always wins when the truth is unverifiable.
    if (commandCreatedMs <= 0L) return true
    if (serverNowMs <= 0L) return true
    val lastUnlock = getLastUnlockElapsed(context)
    if (lastUnlock <= 0L) return false // never unlocked locally → the lock executes
    return try {
      val sinceUnlock = android.os.SystemClock.elapsedRealtime() - lastUnlock
      val unlockAtServerMs = serverNowMs - sinceUnlock
      commandCreatedMs <= unlockAtServerMs
    } catch (_: Exception) { true }
  }
}
