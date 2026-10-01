package com.telepoint.devicemanagement

import android.accessibilityservice.AccessibilityService
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * TelePoint accessibility deterrent (owner-authorized on their financed phone).
 *
 * WHAT IT DOES: while the loan is outstanding, it watches for the screens a
 * customer would use to remove or wipe the collateral app — Settings → App info
 * (Uninstall / Force stop / Clear data), the Package-Installer uninstall
 * confirmation, and the Settings factory-reset confirmation — and steers away:
 * it dismisses the installer dialog with BACK, and sends HOME + relaunches
 * TelePoint for the destructive Settings screens.
 *
 * HONEST LIMITS (do not overclaim):
 *   • Accessibility CANNOT guarantee blocking uninstall or factory reset. It can
 *     simulate Back/Home only; it is user-disableable, is always off in Safe Mode,
 *     and is removed by Force-stop / Clear-data of THIS app.
 *   • The GUARANTEED block remains Device Owner (`FinancingProtection.apply`:
 *     setUninstallBlocked + DISALLOW_FACTORY_RESET + DISALLOW_SAFE_BOOT + FRP).
 *   • This service therefore is a defence-in-depth DETERRENT, not a substitute.
 *
 * SAFETY: it never touches the dialer / emergency calling, never reads or stores
 * screen content beyond keyword matching, and does nothing once the loan is
 * released (`LockStateStore.isUninstallProtected == false`).
 */
class TelepointAccessibilityService : AccessibilityService() {

  private val ownLabelLower: String by lazy {
    try { applicationInfo.loadLabel(packageManager).toString().lowercase() } catch (_: Exception) { "telepoint" }
  }

  /** Debounce: skip rapid content-change events so the node tree is not read on
   *  every keystroke; 200 ms is enough to still catch a uninstall confirmation. */
  private var lastCheckMs = 0L

  override fun onServiceConnected() {
    super.onServiceConnected()
    Log.i(TAG, "TelePoint accessibility protection connected")
  }

  override fun onInterrupt() { /* no-op */ }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val ev = event ?: return
    // Release-aware guard first: after the EMI is paid this service is inert.
    if (!LockStateStore.isUninstallProtected(this)) return
    val pkg = ev.packageName?.toString()?.lowercase() ?: return
    if (pkg == packageName) return
    val now = System.currentTimeMillis()
    if (now - lastCheckMs < 200L) return
    lastCheckMs = now

    // Call lock: cover an incoming/ongoing call while the device is locked.
    if (LockStateStore.isLocked(this) && (pkg.contains("incallui") || pkg.contains("dialer"))) {
      TelepointOverlay.show(this, "call", "Device Locked", "EMI payment required", null)
      return
    }

    // Per-app PIN lock: a guarded package came to the foreground.
    if (AppLockStore.isEnabled(this) &&
      pkg in AppLockStore.lockedPackages(this) &&
      !AppLockStore.isTempUnlocked(this, pkg)
    ) {
      TelepointOverlay.show(this, "applock", "App Locked", "EMI payment required", pkg)
      return
    }

    val text = readScreenText()
    when {
      // Package Installer uninstall confirmation FOR TELEPOINT → dismiss it.
      // Scoped to our own package/label so unrelated app uninstalls are untouched.
      pkg.contains("installer") -> {
        if (text.contains(ownLabelLower) || text.contains(packageName)) {
          Log.w(TAG, "Blocked package-installer uninstall prompt for TelePoint")
          performGlobalAction(GLOBAL_ACTION_BACK)
          steerBackToApp()
        }
      }
      // Settings: this app's App info (uninstall / force-stop / clear-data),
      // the device-admin deactivation screen, and the factory-reset confirmation
      // → leave the screen and re-open TelePoint.
      pkg.contains("settings") -> {
        val ownScreen = text.contains(ownLabelLower) || text.contains(packageName)
        val destructive = text.contains("uninstall") ||
          text.contains("force stop") || text.contains("forcestop") ||
          text.contains("clear data") || text.contains("clear storage")
        // The customer must not switch device administration off for our app.
        val adminDeactivate = text.contains("deactivate") && ownScreen
        val factory = text.contains("factory data reset") ||
          text.contains("factory reset") ||
          text.contains("erase all data") || text.contains("erase everything") ||
          text.contains("reset phone")
        if ((ownScreen && (destructive || adminDeactivate)) || factory) {
          Log.w(TAG, "Blocked destructive Settings screen (own=$ownScreen factory=$factory)")
          performGlobalAction(GLOBAL_ACTION_HOME)
          steerBackToApp()
        }
      }
    }
  }

  /** Read visible text of the active window only to keyword-match; nothing is stored. */
  private fun readScreenText(): String {
    val root: AccessibilityNodeInfo = try { rootInActiveWindow } catch (_: Exception) { null } ?: return ""
    val sb = StringBuilder()
    try { collectText(root, sb, 0) } catch (_: Exception) {}
    return sb.toString().lowercase()
  }

  private fun collectText(node: AccessibilityNodeInfo?, sb: StringBuilder, depth: Int) {
    if (node == null || depth > 12) return
    node.text?.let { if (it.isNotEmpty()) sb.append(it).append('\n') }
    node.contentDescription?.let { if (it.isNotEmpty()) sb.append(it).append('\n') }
    val count = try { node.childCount } catch (_: Exception) { 0 }
    for (i in 0 until count) {
      val child = try { node.getChild(i) } catch (_: Exception) { null }
      collectText(child, sb, depth + 1)
    }
  }

  private fun steerBackToApp() {
    try { DeviceActions.launchApp(this) } catch (_: Exception) {}
  }

  companion object {
    private const val TAG = "TelePointA11y"
    const val SERVICE_CLASS = "com.telepoint.devicemanagement.TelepointAccessibilityService"

    fun component(context: Context): ComponentName =
      ComponentName(context.packageName, SERVICE_CLASS)

    /** Live OS state: is OUR accessibility service enabled right now? */
    fun isEnabled(context: Context): Boolean {
      return try {
        val enabled = Settings.Secure.getInt(
          context.contentResolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0,
        )
        if (enabled != 1) return false
        val services = Settings.Secure.getString(
          context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        services.contains(context.packageName) && services.contains("TelepointAccessibilityService")
      } catch (_: Exception) { false }
    }

    // NOTE: there is deliberately NO silent-enable here. Accessibility is turned
    // on by the owner/store with the real system toggle (customer-consented at
    // provisioning); the app only reads/confirms the state via isEnabled().

    /** Release path: remove ONLY our component; leave the user's other services. */
    fun disableBestEffort(context: Context) {
      try {
        val current = Settings.Secure.getString(
          context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return
        val kept = current.split(':').filter {
          it.isNotBlank() &&
            !(it.contains(context.packageName) && it.contains("TelepointAccessibilityService"))
        }
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(context, TelepointDeviceAdminReceiver::class.java)
        if (dpm.isDeviceOwnerApp(context.packageName)) {
          dpm.setSecureSetting(admin, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, kept.joinToString(":"))
          if (kept.isEmpty()) dpm.setSecureSetting(admin, Settings.Secure.ACCESSIBILITY_ENABLED, "0")
        }
      } catch (_: Exception) {
        // Fall back to opening the system toggle so the owner can turn it off.
        try {
          context.startActivity(
            Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
        } catch (_: Exception) {}
      }
    }
  }
}
