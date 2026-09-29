package com.telepoint.reminders

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.tts.TextToSpeech
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.util.Locale

/**
 * JS bridge for the offline reminder engine. The JS scheduler computes the plan
 * (pure, unit-tested); this module persists it and schedules the exact alarms.
 * Only documented Android APIs are used (AlarmManager, TextToSpeech). Degrades
 * safely when exact alarms are not permitted, reporting the true status.
 */
class ExpoTelepointRemindersModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ExpoTelepointReminders")

    AsyncFunction("getExactAlarmStatus") {
      mapOf(
        "canScheduleExactAlarms" to ReminderScheduling.canScheduleExact(context),
        "sdkInt" to Build.VERSION.SDK_INT,
      )
    }

    // Opens the OS "Alarms & reminders" screen (Android 12+) so the user can
    // allow exact alarms. Cannot grant it silently.
    AsyncFunction("requestExactAlarmPermission") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction
      try {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      } catch (_: Exception) {
        try {
          context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
              .setData(Uri.parse("package:${context.packageName}"))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
        } catch (_: Exception) {}
      }
    }

    // Replace the whole scheduled set with the given plan. Idempotent.
    AsyncFunction("applyPlan") { json: String ->
      val root = JSONObject(json)
      val occArr = root.optJSONArray("occurrences")
      val occurrences = ArrayList<Occurrence>()
      if (occArr != null) {
        for (i in 0 until occArr.length()) {
          val o = occArr.getJSONObject(i)
          occurrences.add(
            Occurrence(
              id = o.getString("id"),
              phase = o.optString("phase", "DUE_DAY"),
              fireAt = o.getLong("fireAt"),
              voice = o.optBoolean("voice", false),
              language = o.optString("language", "bn"),
              title = o.optString("title", "EMI Reminder"),
              body = o.optString("body", ""),
              speech = o.optStringSafe("speech"),
              photoPath = o.optStringSafe("photoPath"),
              emiId = o.optStringSafe("emiId"),
              dueDate = o.optStringSafe("dueDate"),
            ),
          )
        }
      }

      val overdueObj = if (root.isNull("overdue")) null else root.optJSONObject("overdue")
      val overdue = OverdueChain.fromJson(overdueObj)

      ReminderStore.saveOccurrences(context, occurrences)
      ReminderStore.saveOverdue(context, overdue)
      val scheduled = ReminderScheduling.rescheduleFromStore(context)
      mapOf("scheduled" to scheduled)
    }

    AsyncFunction("cancelAll") {
      ReminderScheduling.cancelAll(context)
    }

    AsyncFunction("getScheduledIds") {
      val ids = ReminderStore.loadOccurrences(context)
        .filter { it.fireAt > System.currentTimeMillis() }
        .map { it.id }
        .toMutableList()
      val chain = ReminderStore.loadOverdue(context)
      if (chain != null && chain.enabled && System.currentTimeMillis() < chain.untilMs) ids.add("overdue")
      ids
    }

    // Immediate speak — used for the in-app due-day voice and a test button.
    AsyncFunction("speakNow") { text: String, language: String ->
      if (text.isBlank()) return@AsyncFunction false
      speakFireAndForget(context, text, language)
      true
    }
  }

  private fun speakFireAndForget(context: Context, text: String, language: String) {
    val holder = arrayOfNulls<TextToSpeech>(1)
    holder[0] = TextToSpeech(context.applicationContext) { status ->
      if (status != TextToSpeech.SUCCESS) { try { holder[0]?.shutdown() } catch (_: Exception) {}; return@TextToSpeech }
      val locale = if (language == "hi") Locale("hi", "IN") else Locale("bn", "IN")
      try { holder[0]?.language = locale } catch (_: Exception) {}
      holder[0]?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "telepoint-emi-now")
      // Shut the engine down after a generous window so it is not leaked.
      Handler(Looper.getMainLooper()).postDelayed({
        try { holder[0]?.shutdown() } catch (_: Exception) {}
      }, 15000)
    }
  }
}

private fun JSONObject.optStringSafe(key: String): String? =
  if (!has(key) || isNull(key)) null else optString(key, null)
