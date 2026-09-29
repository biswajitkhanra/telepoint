package com.telepoint.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Fires one scheduled reminder. Posts the branded notification FIRST (so it is
 * guaranteed even if TTS is slow or unavailable), then speaks it when voice is
 * enabled (due day, or overdue when explicitly configured), then — for the
 * overdue chain — arms the next 5-minute tick so the burst continues while the
 * app stays closed. Uses goAsync() to keep the process alive briefly for TTS.
 */
class ReminderReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val isOverdue = intent.getBooleanExtra(ReminderScheduling.EXTRA_OVERDUE, false)
    val pending = goAsync()
    try {
      if (isOverdue) handleOverdue(context, pending)
      else handleOccurrence(context, intent.getStringExtra(ReminderScheduling.EXTRA_ID), pending)
    } catch (_: Exception) {
      try { pending.finish() } catch (_: Exception) {}
    }
  }

  private fun handleOccurrence(context: Context, id: String?, pending: PendingResult) {
    if (id == null) { pending.finish(); return }
    val o = ReminderStore.loadOccurrences(context).firstOrNull { it.id == id }
    if (o == null) { pending.finish(); return }
    ReminderNotifier.show(context, o.title, o.body, o.photoPath)
    if (o.voice) speakThenFinish(context, o.speech ?: o.body, o.language, pending)
    else pending.finish()
  }

  private fun handleOverdue(context: Context, pending: PendingResult) {
    val chain = ReminderStore.loadOverdue(context)
    val now = System.currentTimeMillis()
    if (chain == null || !chain.enabled || now >= chain.untilMs) {
      ReminderScheduling.cancelOverdue(context)
      pending.finish()
      return
    }
    ReminderNotifier.show(context, chain.title, chain.body, chain.photoPath)

    // Arm the next tick so the every-5-minutes burst keeps going app-closed.
    val next = ReminderScheduling.nextOverdueTick(chain, now + chain.intervalMs)
    if (next <= chain.untilMs) ReminderScheduling.scheduleOverdueTick(context, next)

    if (chain.voice) speakThenFinish(context, chain.speech ?: chain.body, chain.language, pending)
    else pending.finish()
  }

  /**
   * Speak `text` in the configured language, then finish the async receiver.
   * Always finishes within an 8s budget even if the TTS engine hangs or the
   * language pack is missing — voice is best-effort, the notification is not.
   */
  private fun speakThenFinish(context: Context, text: String, language: String, pending: PendingResult) {
    if (text.isBlank()) { pending.finish(); return }
    val holder = arrayOfNulls<TextToSpeech>(1)
    val handler = Handler(Looper.getMainLooper())
    val done = AtomicBoolean(false)

    fun cleanup() {
      if (done.getAndSet(true)) return
      try { holder[0]?.stop(); holder[0]?.shutdown() } catch (_: Exception) {}
      try { pending.finish() } catch (_: Exception) {}
    }

    val timeout = Runnable { cleanup() }
    handler.postDelayed(timeout, 8000)

    holder[0] = TextToSpeech(context.applicationContext) { status ->
      if (status != TextToSpeech.SUCCESS) { handler.removeCallbacks(timeout); cleanup(); return@TextToSpeech }
      val locale = if (language == "hi") Locale("hi", "IN") else Locale("bn", "IN")
      try { holder[0]?.language = locale } catch (_: Exception) { /* fall back to default */ }
      holder[0]?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {}
        override fun onDone(utteranceId: String?) { handler.removeCallbacks(timeout); cleanup() }
        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) { handler.removeCallbacks(timeout); cleanup() }
      })
      val r = holder[0]?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "telepoint-emi")
      if (r != TextToSpeech.SUCCESS) { handler.removeCallbacks(timeout); cleanup() }
    }
  }
}
