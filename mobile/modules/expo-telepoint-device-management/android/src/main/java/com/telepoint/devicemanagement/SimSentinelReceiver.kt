package com.telepoint.devicemanagement

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionManager

/**
 * SIM sentinel: while the device is enrolled (a baseline SIM signature is set),
 * a SIM removal or an unauthorised SIM swap locks the device — and a swap also
 * texts the financer numbers. Fires on SIM_STATE_CHANGED and BOOT_COMPLETED
 * (catches a swap done while the phone was off).
 *
 * HONEST LIMITATION: `SubscriptionInfo.getIccId()` returns "" for non-privileged
 * apps on Android 10+ (a Device Owner is not automatically privileged for this),
 * so the signature falls back to subscriptionId + carrier — good enough to detect
 * a swap, though not a guaranteed hardware ICCID. Dormant until a baseline exists.
 */
class SimSentinelReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != "android.intent.action.SIM_STATE_CHANGED" && action != Intent.ACTION_BOOT_COMPLETED) return
    val baseline = SimSentinelStore.getBaseline(context) ?: return // dormant if not enrolled
    try { evaluate(context, intent, baseline) } catch (_: Exception) {}
  }

  private fun evaluate(context: Context, intent: Intent, baseline: String) {
    if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return
    val state = intent.getStringExtra("ss") // ABSENT / READY / LOADED / … (may be null on boot)
    val sig = currentSignature(context)

    if (sig == null) {
      // No readable SIM. Lock only on an explicit ABSENT to avoid boot-time
      // false positives (telephony may not be ready yet at BOOT_COMPLETED).
      if (state == "ABSENT") DeviceActions.hardLock(context)
      return
    }
    if (sig != baseline) {
      val code = SmsCommandStore.getCustomerCode(context) ?: ""
      val msg = "ALERT: TelePoint SIM swapped. Customer $code. New SIM: $sig"
      sendAlert(context, SimSentinelStore.getAlertNumbers(context), msg)
      DeviceActions.hardLock(context)
    }
  }

  /** Signature of the SIM in slot 0: hardware ICCID if readable, else a
   *  subscription+carrier fingerprint. Null when no SIM is present. */
  private fun currentSignature(context: Context): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) return null
    val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
    val list = try { sm.activeSubscriptionInfoList } catch (_: Exception) { null } ?: return null
    if (list.isEmpty()) return null
    val sub = list.firstOrNull { it.simSlotIndex == 0 } ?: list.first()
    val icc = try { sub.iccId ?: "" } catch (_: Exception) { "" }
    return if (icc.isNotBlank()) "icc:$icc" else "sub:${sub.subscriptionId}:${sub.carrierName ?: ""}"
  }

  private fun sendAlert(context: Context, numbers: List<String>, msg: String) {
    if (numbers.isEmpty()) return
    if (context.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) return
    val sms = try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) context.getSystemService(SmsManager::class.java)
      else @Suppress("DEPRECATION") SmsManager.getDefault()
    } catch (_: Exception) { null } ?: return
    for (n in numbers) {
      try { sms.sendTextMessage(n, null, msg, null, null) } catch (_: Exception) {}
    }
  }
}
