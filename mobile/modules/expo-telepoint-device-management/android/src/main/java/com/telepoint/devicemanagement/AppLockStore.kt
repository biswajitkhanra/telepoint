package com.telepoint.devicemanagement

import android.content.Context
import java.security.MessageDigest

/**
 * State for the per-app PIN overlay lock (no Accessibility-abuse; the overlay is
 * driven by the owner-consented accessibility service detecting the foreground
 * package, then a full-screen SYSTEM_ALERT_WINDOW overlay asks for the PIN).
 *
 *   • lockedPackages — packages the financer wants guarded (e.g. WhatsApp)
 *   • pinHash        — SHA-256 of the unlock PIN (set at enrollment)
 *   • tempUnlock     — "package:untilEpoch" grants a short grace after a correct
 *                      PIN so the customer can use the app without the overlay
 *                      flickering on every window change.
 */
object AppLockStore {
  private const val PREFS = "telepoint_app_lock"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_PACKAGES = "packages"
  private const val KEY_PIN = "pin_hash"
  private const val KEY_TEMP = "temp_unlock"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isEnabled(c: Context): Boolean = prefs(c).getBoolean(KEY_ENABLED, false)
  fun setEnabled(c: Context, enabled: Boolean) { prefs(c).edit().putBoolean(KEY_ENABLED, enabled).apply() }

  fun lockedPackages(c: Context): Set<String> =
    prefs(c).getString(KEY_PACKAGES, "")?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet() ?: emptySet()

  fun setLockedPackages(c: Context, packages: List<String>) {
    prefs(c).edit().putString(KEY_PACKAGES, packages.joinToString(",")).apply()
  }

  fun setPin(c: Context, pin: String) {
    prefs(c).edit().putString(KEY_PIN, sha256(pin)).apply()
  }

  fun hasPin(c: Context): Boolean = !prefs(c).getString(KEY_PIN, null).isNullOrBlank()

  fun verifyPin(c: Context, pin: String): Boolean {
    val stored = prefs(c).getString(KEY_PIN, null) ?: return false
    return constantTimeEquals(stored, sha256(pin))
  }

  fun grantTempUnlock(c: Context, pkg: String, millis: Long = 60_000L) {
    val until = System.currentTimeMillis() + millis
    val map = tempMap(c).toMutableMap()
    map[pkg] = until
    prefs(c).edit().putString(KEY_TEMP, map.entries.joinToString(",") { "${it.key}:${it.value}" }).apply()
  }

  fun isTempUnlocked(c: Context, pkg: String): Boolean {
    val until = tempMap(c)[pkg] ?: return false
    return System.currentTimeMillis() < until
  }

  fun clear(c: Context) { prefs(c).edit().clear().commit() }

  private fun tempMap(c: Context): Map<String, Long> {
    val raw = prefs(c).getString(KEY_TEMP, "") ?: return emptyMap()
    val map = mutableMapOf<String, Long>()
    raw.split(',').filter { it.isNotBlank() }.forEach {
      val i = it.lastIndexOf(':')
      if (i > 0) {
        val pkg = it.substring(0, i)
        val until = it.substring(i + 1).toLongOrNull() ?: return@forEach
        map[pkg] = until
      }
    }
    return map
  }

  private fun sha256(s: String): String {
    val d = MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8))
    return d.joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

  private fun constantTimeEquals(a: String, b: String): Boolean {
    if (a.length != b.length) return false
    var r = 0
    for (i in a.indices) r = r or (a[i].code xor b[i].code)
    return r == 0
  }
}
