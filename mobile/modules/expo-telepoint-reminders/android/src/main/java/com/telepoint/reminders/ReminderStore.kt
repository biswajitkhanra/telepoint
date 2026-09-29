package com.telepoint.reminders

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persisted reminder plan (SharedPreferences, survives app kill + reboot). The
 * JS side computes the plan; we store it verbatim so the boot / timezone
 * receiver can reschedule the exact same alarms WITHOUT a network call — the
 * whole point of the offline engine.
 */
data class Occurrence(
  val id: String,
  val phase: String,
  val fireAt: Long,
  val voice: Boolean,
  val language: String,
  val title: String,
  val body: String,
  val speech: String?,
  val photoPath: String?,
  val emiId: String?,
  val dueDate: String?,
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id); put("phase", phase); put("fireAt", fireAt)
    put("voice", voice); put("language", language)
    put("title", title); put("body", body)
    put("speech", speech ?: JSONObject.NULL)
    put("photoPath", photoPath ?: JSONObject.NULL)
    put("emiId", emiId ?: JSONObject.NULL)
    put("dueDate", dueDate ?: JSONObject.NULL)
  }

  companion object {
    fun fromJson(o: JSONObject): Occurrence = Occurrence(
      id = o.getString("id"),
      phase = o.optString("phase", "DUE_DAY"),
      fireAt = o.getLong("fireAt"),
      voice = o.optBoolean("voice", false),
      language = o.optString("language", "bn"),
      title = o.optString("title", "EMI Reminder"),
      body = o.optString("body", ""),
      speech = o.optStringOrNull("speech"),
      photoPath = o.optStringOrNull("photoPath"),
      emiId = o.optStringOrNull("emiId"),
      dueDate = o.optStringOrNull("dueDate"),
    )
  }
}

data class OverdueChain(
  val enabled: Boolean,
  /** Epoch ms of the first possible overdue tick (00:00 the day after due). */
  val startMs: Long,
  val intervalMs: Long,
  val untilMs: Long,
  val voice: Boolean,
  val language: String,
  val title: String,
  val body: String,
  val speech: String?,
  val photoPath: String?,
  val emiId: String?,
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("enabled", enabled); put("startMs", startMs); put("intervalMs", intervalMs); put("untilMs", untilMs)
    put("voice", voice); put("language", language)
    put("title", title); put("body", body)
    put("speech", speech ?: JSONObject.NULL)
    put("photoPath", photoPath ?: JSONObject.NULL)
    put("emiId", emiId ?: JSONObject.NULL)
  }

  companion object {
    fun fromJson(o: JSONObject?): OverdueChain? {
      if (o == null) return null
      return OverdueChain(
        enabled = o.optBoolean("enabled", false),
        startMs = o.optLong("startMs", 0L),
        intervalMs = o.optLong("intervalMs", 5 * 60 * 1000L),
        untilMs = o.optLong("untilMs", 0L),
        voice = o.optBoolean("voice", false),
        language = o.optString("language", "bn"),
        title = o.optString("title", "EMI Overdue"),
        body = o.optString("body", ""),
        speech = o.optStringOrNull("speech"),
        photoPath = o.optStringOrNull("photoPath"),
        emiId = o.optStringOrNull("emiId"),
      )
    }
  }
}

private fun JSONObject.optStringOrNull(key: String): String? =
  if (isNull(key) || !has(key)) null else optString(key, null)

object ReminderStore {
  private const val PREFS = "telepoint_reminders"
  private const val KEY_OCCURRENCES = "occurrences"
  private const val KEY_OVERDUE = "overdue"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun saveOccurrences(context: Context, list: List<Occurrence>) {
    val arr = JSONArray()
    list.forEach { arr.put(it.toJson()) }
    prefs(context).edit().putString(KEY_OCCURRENCES, arr.toString()).apply()
  }

  fun loadOccurrences(context: Context): List<Occurrence> {
    val raw = prefs(context).getString(KEY_OCCURRENCES, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { Occurrence.fromJson(arr.getJSONObject(it)) }
    } catch (_: Exception) { emptyList() }
  }

  fun saveOverdue(context: Context, chain: OverdueChain?) {
    val e = prefs(context).edit()
    if (chain == null) e.remove(KEY_OVERDUE) else e.putString(KEY_OVERDUE, chain.toJson().toString())
    e.apply()
  }

  fun loadOverdue(context: Context): OverdueChain? {
    val raw = prefs(context).getString(KEY_OVERDUE, null) ?: return null
    return try { OverdueChain.fromJson(JSONObject(raw)) } catch (_: Exception) { null }
  }

  fun clear(context: Context) {
    prefs(context).edit().remove(KEY_OCCURRENCES).remove(KEY_OVERDUE).apply()
  }
}
