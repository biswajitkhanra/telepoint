package com.telepoint.devicemanagement

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.UserManager
import android.provider.Telephony
import android.telephony.SmsManager
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val TAG = "TelepointSms"

/**
 * Offline device control over SMS for the financed device.
 *
 * A command is honoured ONLY when BOTH hold:
 *   1. the SENDER is one of the authorised admin/retailer numbers (matched on the
 *      last 10 digits, so +91 / 91 / bare all work), and
 *   2. the message names THIS device's customer code (always the LAST token).
 *
 * Grammar (case-insensitive; <custid> e.g. TP1233):
 *   LOCK <custid>              UNLOCK <custid>            REBOOT <custid>
 *   CAMERA ON|OFF <custid>     (OFF = camera disabled)
 *   WIFI ON|OFF <custid>       (real Wi-Fi power — Device Owner)
 *   BLUETOOTH ON|OFF <custid>  USB ON|OFF <custid>
 *   CALLS ON|OFF <custid>      WALLPAPER ON|OFF <custid>
 *   HIDE ON|OFF <custid>       (ON = hide all other apps, EMI-only)
 *   TRACK ON|OFF <custid>      (ON = enable location + SIM tracking)
 * For BLUETOOTH/USB/CALLS/WALLPAPER, OFF = feature restricted, ON = allowed.
 *
 * All actions use documented DevicePolicyManager / WifiManager APIs and require
 * Device Owner (except CAMERA + Wi-Fi power ≤ Android 9, which work under Device
 * Admin). Nothing is faked. The lock state survives reboot (LockStateStore +
 * boot receiver).
 *
 * SECURITY NOTE: the number allowlist is the real gate. SMS sender IDs can be
 * spoofed via online gateways and a customer knows their own code, so this is a
 * convenience channel, not a cryptographic guarantee.
 */
class SmsCommandReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val allowed = SmsCommandStore.getAllowedSenders(context)
    val code = SmsCommandStore.getCustomerCode(context)
    if (allowed.isEmpty() || code.isNullOrBlank()) {
      Log.w(TAG, "SMS ignored: SMS control not configured")
      SmsCommandStore.recordEvent(context, "not_configured")
      return
    }

    val messages = try { Telephony.Sms.Intents.getMessagesFromIntent(intent) } catch (_: Exception) { null } ?: return
    if (messages.isEmpty()) return

    val sender = messages[0].originatingAddress ?: messages[0].displayOriginatingAddress ?: return
    val senderKey = SmsCommandStore.normalizeNumber(sender)
    if (senderKey.length != 10 || senderKey !in allowed) {
      // Do not log the number itself (no PII); just the reason.
      Log.w(TAG, "SMS rejected: sender not in allowlist")
      SmsCommandStore.recordEvent(context, "sender_not_allowed")
      return
    }

    val body = messages.joinToString("") { it.messageBody ?: "" }.trim()
    Log.i(TAG, "SMS from allowlisted sender; verb=${body.split(Regex("\\s+")).firstOrNull()}")
    try { handle(context, body, code, sender) } catch (_: Exception) {
      SmsCommandStore.recordEvent(context, "error")
    }
  }

  private fun handle(context: Context, body: String, code: String, sender: String) {
    val parts = body.split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.size < 2) {
      SmsCommandStore.recordEvent(context, "malformed")
      return
    }
    // Customer code is always the LAST token and must match this device.
    if (!parts.last().equals(code, ignoreCase = true)) {
      SmsCommandStore.recordEvent(context, "code_mismatch")
      return
    }

    val verb = parts[0].uppercase()
    SmsCommandStore.recordEvent(context, "executed", verb)
    when (verb) {
      "LOCK" -> if (parts.size == 2) applyLock(context, true)
      "UNLOCK" -> if (parts.size == 2) applyLock(context, false)
      "REBOOT" -> if (parts.size == 2) reboot(context)
      "LOC" -> if (parts.size == 2) replyLocation(context, sender, code)
      else -> {
        if (parts.size != 3) return
        val onoff = parts[1].uppercase()
        if (onoff != "ON" && onoff != "OFF") return
        val off = onoff == "OFF"
        when (verb) {
          "CAMERA" -> setCamera(context, off)                                    // OFF = disable camera
          "WIFI" -> setWifiPower(context, !off)                                  // ON = power on
          "BLUETOOTH" -> setRestriction(context, UserManager.DISALLOW_BLUETOOTH, off)
          "USB" -> setRestriction(context, UserManager.DISALLOW_USB_FILE_TRANSFER, off)
          "CALLS" -> setRestriction(context, UserManager.DISALLOW_OUTGOING_CALLS, off)
          "WALLPAPER" -> setRestriction(context, UserManager.DISALLOW_SET_WALLPAPER, off)
          "HIDE" -> DeviceActions.hideAllUserApps(context, !off)                 // ON = hide other apps
          "TRACK" -> TrackingStore.setEnabled(context, !off)                     // ON = enable tracking
          "WALL" ->                                                             // ON = branded overdue wallpaper
            if (off) WallpaperManagerHelper.restoreCustomerWallpaper(context)
            else WallpaperManagerHelper.setOverdueWallpaper(context)
          else -> { /* unknown verb — ignore */ }
        }
      }
    }
  }

  private fun dpm(c: Context) = c.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
  private fun admin(c: Context) = ComponentName(c, TelepointDeviceAdminReceiver::class.java)
  private fun isOwner(c: Context) = dpm(c).isDeviceOwnerApp(c.packageName)

  private fun applyLock(context: Context, locked: Boolean) {
    if (locked) DeviceActions.hardLock(context) else DeviceActions.releaseLock(context)
  }

  private fun setCamera(context: Context, disabled: Boolean) {
    val d = dpm(context); val a = admin(context)
    if (!d.isAdminActive(a)) return
    try { d.setCameraDisabled(a, disabled) } catch (_: Exception) {}
  }

  private fun setRestriction(context: Context, restriction: String, restrict: Boolean) {
    if (!isOwner(context)) return
    val d = dpm(context); val a = admin(context)
    try { if (restrict) d.addUserRestriction(a, restriction) else d.clearUserRestriction(a, restriction) } catch (_: Exception) {}
  }

  private fun setWifiPower(context: Context, on: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !isOwner(context)) return
    try {
      val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      wm.setWifiEnabled(on)
    } catch (_: Exception) {}
  }

  private fun reboot(context: Context) {
    if (!isOwner(context) || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
    try { dpm(context).reboot(admin(context)) } catch (_: Exception) {}
  }

  /** `LOC <custid>` → text the last-known location (+ maps link) back to sender. */
  private fun replyLocation(context: Context, sender: String, code: String) {
    if (context.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) return
    val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val loc = if (!fine && !coarse) null else try {
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
    } catch (_: SecurityException) { null } catch (_: Exception) { null }

    val msg = if (loc != null) {
      val lat = String.format(Locale.US, "%.5f", loc.latitude)
      val lng = String.format(Locale.US, "%.5f", loc.longitude)
      val t = SimpleDateFormat("dd-MM HH:mm", Locale.getDefault()).format(Date(loc.time))
      "TelePoint LOC [$code]: $lat,$lng ($t) https://maps.google.com/?q=$lat,$lng"
    } else {
      "TelePoint LOC [$code]: location unavailable (indoors / GPS off)."
    }
    try {
      val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) context.getSystemService(SmsManager::class.java)
        else @Suppress("DEPRECATION") SmsManager.getDefault()
      sms?.sendTextMessage(sender, null, msg, null, null)
    } catch (_: Exception) {}
  }
}
