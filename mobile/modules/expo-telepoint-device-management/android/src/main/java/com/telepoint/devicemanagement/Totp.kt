package com.telepoint.devicemanagement

import android.content.Context
import java.nio.ByteBuffer
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Offline unlock via TOTP (RFC 6238, HMAC-SHA1, 30s step, 6 digits). The device
 * and the server share a per-device secret (provisioned at enrolment). The
 * financer reads the current 6-digit code (shown in the portal) to the customer
 * over the phone; the app verifies it LOCALLY — no internet — and unlocks.
 *
 * Time robustness: DISALLOW_CONFIG_DATE_TIME (applied while owing) stops the
 * customer changing the clock, and a small ± step window absorbs normal drift.
 * A dead-battery clock reset can still break TOTP until the phone gets time from
 * the network again — documented, not hidden.
 */
object Totp {
  private const val PREFS = "telepoint_totp"
  private const val KEY_SECRET = "secret_b32"
  private const val STEP = 30L
  private const val DIGITS = 6
  private const val B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun setSecret(c: Context, b32: String) { prefs(c).edit().putString(KEY_SECRET, b32.trim().uppercase()).apply() }
  private fun getSecret(c: Context): String? = prefs(c).getString(KEY_SECRET, null)
  fun hasSecret(c: Context): Boolean = !getSecret(c).isNullOrBlank()

  /** True if `code` is valid for now ± `window` steps. */
  fun verify(c: Context, code: String, window: Int = 2): Boolean {
    val clean = code.trim()
    if (clean.length != DIGITS || !clean.all { it.isDigit() }) return false
    val key = decodeBase32(getSecret(c) ?: return false) ?: return false
    val counter = System.currentTimeMillis() / 1000 / STEP
    for (i in -window..window) {
      if (constantTimeEquals(generate(key, counter + i), clean)) return true
    }
    return false
  }

  private fun generate(key: ByteArray, counter: Long): String {
    val buf = ByteBuffer.allocate(8).putLong(counter).array()
    val mac = Mac.getInstance("HmacSHA1")
    mac.init(SecretKeySpec(key, "HmacSHA1"))
    val h = mac.doFinal(buf)
    val offset = h[h.size - 1].toInt() and 0x0f
    val bin = ((h[offset].toInt() and 0x7f) shl 24) or
      ((h[offset + 1].toInt() and 0xff) shl 16) or
      ((h[offset + 2].toInt() and 0xff) shl 8) or
      (h[offset + 3].toInt() and 0xff)
    return (bin % 1_000_000).toString().padStart(DIGITS, '0')
  }

  private fun decodeBase32(s: String): ByteArray? {
    val clean = s.trim().uppercase().replace("=", "").filter { it != ' ' }
    if (clean.isEmpty()) return null
    var buffer = 0
    var bits = 0
    val out = ArrayList<Byte>()
    for (ch in clean) {
      val v = B32.indexOf(ch)
      if (v < 0) return null
      buffer = (buffer shl 5) or v
      bits += 5
      if (bits >= 8) {
        bits -= 8
        out.add(((buffer shr bits) and 0xff).toByte())
      }
    }
    return out.toByteArray()
  }

  private fun constantTimeEquals(a: String, b: String): Boolean {
    if (a.length != b.length) return false
    var r = 0
    for (i in a.indices) r = r or (a[i].code xor b[i].code)
    return r == 0
  }
}
