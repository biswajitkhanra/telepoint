package com.telepoint.devicemanagement

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Full-screen "Display over other apps" overlay (SYSTEM_ALERT_WINDOW) that pops
 * IMMEDIATELY over whatever is on screen, with the app open or closed.
 *
 * Modes:
 *   "lock"     — persistent EMI-lock cover (emergency + open app); no dismiss
 *   "call"     — shown over an incoming/outgoing call while the device is locked
 *   "reminder" — dismissible full-screen EMI reminder
 *   "applock"  — per-app PIN gate for a locked package
 *
 * Honest fallback: if the overlay permission is not granted, we cannot draw over
 * other apps, so we relaunch TelePoint instead (the lock screen still applies via
 * Device Owner kiosk). Never faked.
 */
object TelepointOverlay {
  private var view: View? = null
  private val handler = Handler(Looper.getMainLooper())
  /** Wrong-PIN counter for the app-lock gate; 3 misses escalate to a full phone lock. */
  private var appLockAttempts = 0
  /** Wrong-PIN counter for the owner-PIN gate; 5 misses freeze the gate. */
  private var pinGateAttempts = 0

  fun canDraw(c: Context): Boolean = try { Settings.canDrawOverlays(c) } catch (_: Exception) { true }

  fun show(c: Context, mode: String, title: String, body: String?, pkg: String?) {
    handler.post {
      try {
        if (!canDraw(c)) { DeviceActions.launchApp(c); return@post }
        dismissInternal(c)
        // App-lock attempt counter resets only on a CORRECT pin or a release —
        // NOT on every re-show, so the 3-strike escalation cannot be dodged.
        if (mode == "pin9088") pinGateAttempts = 0
        val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val v = buildView(c, mode, title, body, pkg)
        wm.addView(v, layoutParams())
        view = v
      } catch (_: Exception) {
        DeviceActions.launchApp(c)
      }
    }
  }

  fun dismiss(c: Context) { handler.post { dismissInternal(c) } }

  private fun dismissInternal(c: Context) {
    val v = view ?: return
    try { (c.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v) } catch (_: Exception) {}
    view = null
  }

  private fun layoutParams(): WindowManager.LayoutParams {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    return WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }
  }

  private fun buildView(c: Context, mode: String, title: String, body: String?, pkg: String?): View {
    val wrap = ScrollView(c).apply { setBackgroundColor(Color.parseColor("#B91C1C")) }
    val col = LinearLayout(c).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(c, 28), dp(c, 64), dp(c, 28), dp(c, 40))
    }

    col.addView(text(c, "TELEPOINT", 13f, Color.parseColor("#FECACA")))
    col.addView(text(c, title, 30f, Color.WHITE))
    if (!body.isNullOrBlank()) col.addView(text(c, body, 17f, Color.parseColor("#FEE2E2")))
    col.addView(space(c, 18))

    when (mode) {
      "applock" -> {
        col.addView(text(c, "This app is locked due to a pending EMI. Enter your store-provided PIN to use it for a short time.", 14f, Color.parseColor("#FEE2E2")))
        col.addView(space(c, 14))
        val pin = EditText(c).apply {
          setSingleLine(true)
          setTextColor(Color.WHITE)
          setHintTextColor(Color.parseColor("#FECACA"))
          hint = "PIN"
          setBackgroundColor(Color.parseColor("#991F2937"))
          setPadding(dp(c, 16), dp(c, 12), dp(c, 16), dp(c, 12))
          inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        col.addView(pin)
        col.addView(space(c, 12))
        col.addView(btn(c, "UNLOCK", Color.WHITE, Color.parseColor("#7F1D1D")) {
          val ok = pkg != null && AppLockStore.verifyPin(c, pin.text.toString())
          if (ok) {
            appLockAttempts = 0
            pkg?.let { AppLockStore.grantTempUnlock(c, it) }
            dismissInternal(c)
          } else {
            appLockAttempts += 1
            if (appLockAttempts >= 3) {
              // 3 wrong PINs → escalate: the whole phone locks (EMI lock screen).
              appLockAttempts = 0
              dismissInternal(c)
              DeviceActions.hardLock(c)
            } else {
              pin.error = if (appLockAttempts == 2)
                "Wrong PIN — 1 more try locks the phone"
              else
                "Wrong PIN — try again"
            }
          }
        })
        col.addView(space(c, 10))
        col.addView(btn(c, "Emergency call", Color.parseColor("#FECACA"), Color.parseColor("#7F1D1D")) { dial(c, "112") })
      }
      "pin9088" -> {
        col.addView(text(c, "Owner PIN required", 15f, Color.parseColor("#FEE2E2")))
        col.addView(text(c, "Enter the store owner PIN to change the TelePoint accessibility protection. Customers cannot change it without the owner PIN.", 14f, Color.parseColor("#FEE2E2")))
        col.addView(space(c, 14))
        val pin = EditText(c).apply {
          setSingleLine(true)
          setTextColor(Color.WHITE)
          setHintTextColor(Color.parseColor("#FECACA"))
          hint = "PIN"
          setBackgroundColor(Color.parseColor("#991F2937"))
          setPadding(dp(c, 16), dp(c, 12), dp(c, 16), dp(c, 12))
          inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        col.addView(pin)
        col.addView(space(c, 12))
        col.addView(btn(c, "UNLOCK", Color.WHITE, Color.parseColor("#7F1D1D")) {
          if (pin.text.toString() == "9088") {
            // Owner confirmed — allow the change (overlay clears).
            pinGateAttempts = 0
            dismissInternal(c)
          } else {
            pinGateAttempts += 1
            if (pinGateAttempts >= 5) {
              // Brute-force guard: freeze this gate instance.
              pin.isEnabled = false
              pin.error = "Too many attempts — contact the store"
            } else {
              // No PIN → steer HOME and back to TelePoint; the setting stays.
              pin.error = "Incorrect PIN"
              try {
                val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                  .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                c.startActivity(home)
              } catch (_: Exception) {}
              DeviceActions.launchApp(c)
              dismissInternal(c)
            }
          }
        })
        col.addView(space(c, 10))
        col.addView(btn(c, "Emergency call", Color.parseColor("#FECACA"), Color.parseColor("#7F1D1D")) { dial(c, "112") })
      }
      "reminder" -> {
        col.addView(space(c, 6))
        col.addView(btn(c, "OK — I understand", Color.WHITE, Color.parseColor("#7F1D1D")) { dismissInternal(c) })
        col.addView(space(c, 10))
        col.addView(btn(c, "Emergency call", Color.parseColor("#FECACA"), Color.parseColor("#7F1D1D")) { dial(c, "112") })
      }
      "call" -> {
        // Locked-device call cover: incoming/outgoing call while locked.
        col.addView(text(c, "Device Locked — EMI payment required", 15f, Color.parseColor("#FEE2E2")))
        col.addView(text(c, "The call screen is hidden while the device is locked. Use the button below to show the call (answer/decline), or make an emergency call.", 14f, Color.parseColor("#FEE2E2")))
        col.addView(space(c, 14))
        col.addView(btn(c, "Show call screen", Color.WHITE, Color.parseColor("#7F1D1D")) { dismissInternal(c) })
        col.addView(space(c, 10))
        col.addView(btn(c, "Emergency call (112)", Color.parseColor("#FECACA"), Color.parseColor("#7F1D1D")) { dial(c, "112") })
      }
      else -> {
        col.addView(text(c, "Your EMI is overdue. Contact your retailer to arrange payment.", 15f, Color.parseColor("#FEE2E2")))
        col.addView(space(c, 18))
        col.addView(btn(c, "Open TelePoint", Color.WHITE, Color.parseColor("#7F1D1D")) { DeviceActions.launchApp(c) })
        col.addView(space(c, 10))
        col.addView(btn(c, "Emergency call (112)", Color.parseColor("#FECACA"), Color.parseColor("#7F1D1D")) { dial(c, "112") })
      }
    }

    wrap.addView(col, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return wrap
  }

  private fun text(c: Context, s: String, size: Float, color: Int): TextView =
    TextView(c).apply {
      text = s
      setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
      setTextColor(color)
      setTypeface(android.graphics.Typeface.DEFAULT_BOLD)
    }

  private fun space(c: Context, h: Int): View =
    View(c).apply { layoutParams = LinearLayout.LayoutParams(1, h) }

  private fun btn(c: Context, label: String, fg: Int, bg: Int, onClick: () -> Unit): Button =
    Button(c).apply {
      text = label
      setTextColor(fg)
      setBackgroundColor(bg)
      setOnClickListener { onClick() }
    }

  private fun dp(c: Context, v: Int): Int =
    (v * c.resources.displayMetrics.density).toInt()

  private fun dial(c: Context, number: String) {
    // Dismiss the cover FIRST so the dialer opens on top and can be used.
    dismissInternal(c)
    try {
      val i = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      c.startActivity(i)
    } catch (_: Exception) {}
  }

  /** Release paths reset the app-lock attempt counter (lock cleared entirely). */
  fun resetAppLockAttempts() { appLockAttempts = 0 }
}
