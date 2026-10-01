package com.telepoint.devicemanagement

import android.content.Context

/**
 * Config for the offline SMS LOCK/UNLOCK channel:
 *   • allowedSenders — the authorised admin/retailer phone numbers (stored as
 *     the last 10 digits so +91/91/bare all match), and
 *   • customerCode   — THIS device's customer code (e.g. "TP1233"), the token an
 *     authorised SMS must name so a command hits the right phone.
 *
 * Stored in SharedPreferences so the SMS receiver verifies with NO network — the
 * point of the offline channel. A command is honoured only when the sender is in
 * the allowlist AND the customer code matches (see SmsCommandReceiver).
 */
object SmsCommandStore {
  private const val PREFS = "telepoint_sms_cmd"
  private const val KEY_SENDERS = "allowed_senders" // csv of last-10-digit numbers
  private const val KEY_CODE = "customer_code"
  private const val KEY_LAST_EVENT = "last_event"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun clear(c: Context) { prefs(c).edit().clear().commit() }

  /**
   * Bounded, non-PII last result for on-device debugging (PIN-9088 panel):
   * kind is e.g. "sender_not_allowed" / "code_mismatch" / "executed"; detail is
   * a command verb only. Never stores a phone number, customer code or body.
   */
  fun recordEvent(c: Context, kind: String, detail: String = "") {
    prefs(c).edit().putString(KEY_LAST_EVENT, "${System.currentTimeMillis()}|$kind|$detail").apply()
  }

  /** Raw "timestamp|kind|detail" of the last SMS result, or null if none yet. */
  fun getLastEvent(c: Context): String? = prefs(c).getString(KEY_LAST_EVENT, null)

  /** Digits only, last 10 — so 7003617029, 917003617029, +91 7003617029 all match. */
  fun normalizeNumber(raw: String): String {
    val digits = raw.filter { it.isDigit() }
    return if (digits.length >= 10) digits.takeLast(10) else digits
  }

  fun setConfig(c: Context, sendersCsv: String, customerCode: String) {
    val norm = sendersCsv.split(',', ';')
      .map { normalizeNumber(it.trim()) }
      .filter { it.length == 10 }
      .distinct()
      .joinToString(",")
    prefs(c).edit()
      .putString(KEY_SENDERS, norm)
      .putString(KEY_CODE, customerCode.trim())
      .apply()
  }

  fun getAllowedSenders(c: Context): Set<String> {
    val raw = prefs(c).getString(KEY_SENDERS, "") ?: ""
    return raw.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
  }

  fun getCustomerCode(c: Context): String? = prefs(c).getString(KEY_CODE, null)

  fun isConfigured(c: Context): Boolean =
    getAllowedSenders(c).isNotEmpty() && !getCustomerCode(c).isNullOrBlank()
}
