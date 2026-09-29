package com.telepoint.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Shared alarm plumbing. Schedules EXACT alarms via AlarmManager using only the
 * documented API. Each alarm's request code is a deterministic hash of its
 * stable id, so scheduling and cancelling always line up and re-applying a plan
 * never duplicates. Falls back to an inexact allow-while-idle alarm when exact
 * alarms are not permitted (Android 12+ without SCHEDULE_EXACT_ALARM) rather
 * than crashing — reported honestly by getExactAlarmStatus().
 */
object ReminderScheduling {
  const val EXTRA_ID = "telepoint_reminder_id"
  const val EXTRA_OVERDUE = "telepoint_reminder_overdue"
  private const val OVERDUE_REQUEST_CODE = 0x7E1E0D0E // stable, unique to the overdue chain

  private fun alarmManager(context: Context): AlarmManager =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return try { alarmManager(context).canScheduleExactAlarms() } catch (_: Exception) { false }
  }

  private fun pendingIntent(context: Context, requestCode: Int, id: String?, overdue: Boolean): PendingIntent {
    val intent = Intent(context, ReminderReceiver::class.java).apply {
      if (id != null) putExtra(EXTRA_ID, id)
      if (overdue) putExtra(EXTRA_OVERDUE, true)
      // A distinct data URI per request code so the PendingIntents are not
      // treated as equal (extras alone are ignored by PendingIntent equality).
      data = android.net.Uri.parse("telepoint-reminder://$requestCode")
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, requestCode, intent, flags)
  }

  private fun setExact(context: Context, triggerAtMs: Long, pi: PendingIntent) {
    val am = alarmManager(context)
    try {
      if (canScheduleExact(context)) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
      } else {
        // Best available without the exact-alarm permission.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
      }
    } catch (_: SecurityException) {
      try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi) } catch (_: Exception) {}
    } catch (_: Exception) {}
  }

  fun scheduleOccurrence(context: Context, o: Occurrence) {
    if (o.fireAt <= System.currentTimeMillis()) return
    setExact(context, o.fireAt, pendingIntent(context, o.id.hashCode(), o.id, false))
  }

  fun cancelOccurrence(context: Context, id: String) {
    alarmManager(context).cancel(pendingIntent(context, id.hashCode(), id, false))
  }

  /** Schedule the next overdue tick at `triggerAtMs`. Re-armed by the receiver. */
  fun scheduleOverdueTick(context: Context, triggerAtMs: Long) {
    setExact(context, triggerAtMs, pendingIntent(context, OVERDUE_REQUEST_CODE, null, true))
  }

  fun cancelOverdue(context: Context) {
    alarmManager(context).cancel(pendingIntent(context, OVERDUE_REQUEST_CODE, null, true))
  }

  /**
   * The next tick at or after `from`, aligned to the chain's start instant so
   * ticks land on startMs + k*interval — exactly matching the JS scheduler's
   * overdue grid (overdueStart + k*5min).
   */
  fun nextOverdueTick(chain: OverdueChain, from: Long): Long {
    val interval = if (chain.intervalMs > 0) chain.intervalMs else 5 * 60 * 1000L
    if (from <= chain.startMs) return chain.startMs
    val delta = from - chain.startMs
    val k = Math.ceil(delta.toDouble() / interval).toLong()
    return chain.startMs + k * interval
  }

  /**
   * Cancel everything we currently own (from the store) and re-schedule exactly
   * the persisted plan. Used by applyPlan and by the boot / timezone receiver.
   */
  fun rescheduleFromStore(context: Context): Int {
    val now = System.currentTimeMillis()
    var count = 0

    val occurrences = ReminderStore.loadOccurrences(context)
    // Cancel then re-schedule future ones; drop past ones so the store stays lean.
    val future = ArrayList<Occurrence>()
    for (o in occurrences) {
      cancelOccurrence(context, o.id)
      if (o.fireAt > now) {
        scheduleOccurrence(context, o)
        future.add(o)
        count += 1
      }
    }
    ReminderStore.saveOccurrences(context, future)

    val chain = ReminderStore.loadOverdue(context)
    cancelOverdue(context)
    if (chain != null && chain.enabled && now < chain.untilMs) {
      // Never before the overdue window opens (the day after the due date).
      val from = Math.max(now + 1000L, chain.startMs)
      val next = nextOverdueTick(chain, from)
      if (next in (now + 1)..chain.untilMs) {
        scheduleOverdueTick(context, next)
        count += 1
      }
    }
    return count
  }

  fun cancelAll(context: Context) {
    for (o in ReminderStore.loadOccurrences(context)) cancelOccurrence(context, o.id)
    cancelOverdue(context)
    ReminderStore.clear(context)
  }
}
