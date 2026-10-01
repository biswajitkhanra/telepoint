package com.telepoint.reminders

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.io.File

/**
 * Builds + posts the branded EMI reminder notification. Uses a HIGH-importance
 * channel so it shows as a heads-up banner even when the app is closed, shows
 * the cached customer photo when available (offline), and taps through to the
 * EMI schedule. It is a real Android notification — never a fake system screen.
 */
object ReminderNotifier {
  const val CHANNEL_ID = "emi-reminders"
  // One id for all EMI reminders so a newer one REPLACES the previous banner
  // instead of stacking 24 entries on the due day.
  private const val NOTIFICATION_ID = 42424

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "EMI Reminders",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Upcoming and overdue EMI payment reminders"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 250, 250, 250)
    }
    mgr.createNotificationChannel(channel)
  }

  private fun launchIntent(context: Context): android.app.PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    launch.putExtra("screen", "EmiSchedule")
    launch.putExtra("type", "emi_reminder")
    var flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or android.app.PendingIntent.FLAG_IMMUTABLE
    return android.app.PendingIntent.getActivity(context, 0, launch, flags)
  }

  fun show(context: Context, title: String, body: String, photoPath: String?) {
    ensureChannel(context)

    // Small icon: the app's own icon (a real, present resource). Wrapped so a
    // missing/odd resource never prevents the notification from posting.
    val smallIcon = try { context.applicationInfo.icon } catch (_: Exception) { android.R.drawable.ic_dialog_info }

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(if (smallIcon != 0) smallIcon else android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setVibrate(longArrayOf(0, 250, 250, 250))

    val launch = launchIntent(context)
    launch?.let { builder.setContentIntent(it) }
    // Attempt a full-screen takeover so the reminder is visible even while the
    // screen is locked / another app is open. On Android 14+ this only takes
    // effect when the OS grants the app "full-screen notifications"; otherwise
    // Android silently falls back to the normal heads-up banner. Never faked.
    if (launch != null) {
      try { builder.setFullScreenIntent(launch, true) } catch (_: Exception) {}
    }

    // Cached customer photo (offline-capable): shown as the large icon + big
    // picture when the file exists locally. Never fetched here.
    if (!photoPath.isNullOrBlank()) {
      try {
        val f = File(photoPath)
        if (f.exists()) {
          val bmp = BitmapFactory.decodeFile(photoPath)
          if (bmp != null) {
            builder.setLargeIcon(bmp)
            builder.setStyle(
              NotificationCompat.BigPictureStyle()
                .bigPicture(bmp)
                .bigLargeIcon(null as android.graphics.Bitmap?)
                .setSummaryText(body),
            )
          }
        }
      } catch (_: Exception) { /* photo optional */ }
    }

    val notification: Notification = builder.build()
    try {
      // POST_NOTIFICATIONS (Android 13+) is requested by the JS app; if it was
      // denied this call is simply ignored by the OS. NotificationManagerCompat
      // guards the permission check internally.
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      /* permission not granted — nothing to show */
    } catch (_: Exception) { }
  }
}
