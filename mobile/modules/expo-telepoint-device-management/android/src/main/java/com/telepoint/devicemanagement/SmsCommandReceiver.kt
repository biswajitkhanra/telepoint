package com.telepoint.devicemanagement

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Offline LOCK/UNLOCK over SMS for the financed device.
 *
 * A command is honoured ONLY when BOTH hold:
 *   1. the SENDER is one of the authorised admin/retailer numbers (matched on the
 *      last 10 digits, so +91 / 91 / bare all work), and
 *   2. the message names THIS device's customer code.
 *
 * Message (case-insensitive, easy to type from any phone):
 *   LOCK <custid>        e.g.  LOCK TP1233
 *   UNLOCK <custid>      e.g.  UNLOCK TP1233
 *
 * On LOCK it sets the persisted lock flag (which survives reboot — the boot
 * receiver re-asserts it), calls the documented DevicePolicyManager.lockNow(),
 * and brings up the app's own lock screen. On UNLOCK it clears the flag. No fake
 * system UI, no hidden APIs.
 *
 * SECURITY NOTE: the number allowlist is the real gate. SMS sender IDs can be
 * spoofed via online gateways, and a customer knows their own code, so this is a
 * convenience channel, not a cryptographic guarantee. For stronger assurance an
 * HMAC-signed variant can be layered on later.
 */
class SmsCommandReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val allowed = SmsCommandStore.getAllowedSenders(context)
    val code = SmsCommandStore.getCustomerCode(context)
    if (allowed.isEmpty() || code.isNullOrBlank()) return

    val messages = try { Telephony.Sms.Intents.getMessagesFromIntent(intent) } catch (_: Exception) { null } ?: return
    if (messages.isEmpty()) return

    val sender = messages[0].originatingAddress ?: messages[0].displayOriginatingAddress ?: return
    val senderKey = SmsCommandStore.normalizeNumber(sender)
    if (senderKey.length != 10 || senderKey !in allowed) return

    val body = messages.joinToString("") { it.messageBody ?: "" }.trim()
    try { handle(context, body, code) } catch (_: Exception) { /* ignore malformed */ }
  }

  private fun handle(context: Context, body: String, code: String) {
    val parts = body.split(Regex("\\s+"))
    if (parts.size < 2) return
    val cmd = parts[0].uppercase()
    if (cmd != "LOCK" && cmd != "UNLOCK") return
    val custid = parts[1].trim()
    if (!custid.equals(code, ignoreCase = true)) return
    apply(context, cmd)
  }

  private fun apply(context: Context, cmd: String) {
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val admin = ComponentName(context, TelepointDeviceAdminReceiver::class.java)
    if (cmd == "LOCK") {
      LockStateStore.setLocked(context, true)
      try { if (dpm.isAdminActive(admin)) dpm.lockNow() } catch (_: Exception) {}
      try {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launch != null) {
          launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          context.startActivity(launch)
        }
      } catch (_: Exception) {}
    } else {
      LockStateStore.setLocked(context, false)
    }
  }
}
