package com.telepoint.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-schedules the persisted reminder plan after a reboot, an app update, or a
 * clock / timezone change — with NO network call and without the app being
 * opened. This is what makes the offline reminder engine survive a restart and
 * re-align its 10:00 / 18:00 / hourly / 5-minute slots when the timezone moves.
 */
class ReminderBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      "android.intent.action.QUICKBOOT_POWERON" -> {
        try { ReminderScheduling.rescheduleFromStore(context) } catch (_: Exception) {}
      }
    }
  }
}
