package com.telepoint.devicemanagement

import android.content.Context

/**
 * Persisted config for the native command-delivery foreground service. The
 * service needs the portal URL, this install's identity and the signed session
 * token so it can poll `/api/device/commands` with NO React app running.
 *
 * The token is the same signed customer-session token the JS client uses; it is
 * not a new secret and never leaves the device except back to the portal it was
 * issued by. Stored in private SharedPreferences (device-owner-locked device).
 */
object CommandServiceStore {
  private const val PREFS = "telepoint_cmd_service"
  private const val KEY_BASE_URL = "base_url"
  private const val KEY_CUSTOMER_ID = "customer_id"
  private const val KEY_INSTALLATION_ID = "installation_id"
  private const val KEY_TOKEN = "session_token"
  private const val KEY_FRP_ACCOUNTS = "frp_accounts_csv"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun configure(
    c: Context,
    baseUrl: String,
    customerId: String,
    installationId: String,
    sessionToken: String,
    frpAccountsCsv: String,
  ) {
    prefs(c).edit()
      .putString(KEY_BASE_URL, baseUrl.trim().trimEnd('/'))
      .putString(KEY_CUSTOMER_ID, customerId.trim())
      .putString(KEY_INSTALLATION_ID, installationId.trim())
      .putString(KEY_TOKEN, sessionToken.trim())
      .putString(KEY_FRP_ACCOUNTS, frpAccountsCsv.trim())
      .apply()
  }

  fun getBaseUrl(c: Context): String? = prefs(c).getString(KEY_BASE_URL, null)?.ifBlank { null }
  fun getCustomerId(c: Context): String? = prefs(c).getString(KEY_CUSTOMER_ID, null)?.ifBlank { null }
  fun getInstallationId(c: Context): String? = prefs(c).getString(KEY_INSTALLATION_ID, null)?.ifBlank { null }
  fun getToken(c: Context): String? = prefs(c).getString(KEY_TOKEN, null)?.ifBlank { null }

  fun getFrpAccounts(c: Context): List<String> =
    (prefs(c).getString(KEY_FRP_ACCOUNTS, "") ?: "")
      .split(',')
      .map { it.trim() }
      .filter { it.isNotEmpty() }

  fun isConfigured(c: Context): Boolean =
    !getBaseUrl(c).isNullOrBlank() &&
      !getCustomerId(c).isNullOrBlank() &&
      !getInstallationId(c).isNullOrBlank() &&
      !getToken(c).isNullOrBlank()

  fun clear(c: Context) { prefs(c).edit().clear().commit() }
}
