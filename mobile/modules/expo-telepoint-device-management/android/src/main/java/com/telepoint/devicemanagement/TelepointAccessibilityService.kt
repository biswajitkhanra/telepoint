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

  /** Per-window PIN-gate suppression: the owner is asked once per screen visit. */
  private var gatedWindowId = -1
  private var gatedAtMs = 0L

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

    // Only walk the node tree on the few tamper-relevant packages — never on
    // chatty third-party apps (battery).
    val relevant = pkg.contains("installer") || pkg.contains("vending") ||
      pkg.contains("settings") || pkg.contains("permissioncontroller") ||
      pkg.contains("iqoo.secure") || pkg.contains("vivo.permissionmanager") ||
      pkg.contains("miui.securitycenter") || pkg.contains("coloros.safecenter")
    if (!relevant) return
    val text = readScreenText()

    // OWNER-PIN GATE: changing OUR accessibility protection requires the store
    // owner PIN. Triggers on any settings/OEM-manager screen showing OUR label
    // (list AND detail screens — the detail screen is the actual toggle), with
    // per-window suppression so the owner is only asked once per screen visit.
    val showsOurLabel = text.contains(ownLabelLower) || text.contains("telepoint device protection") || text.contains("telepoint protection")
    if (showsOurLabel) {
      val winId = try { ev.windowId } catch (_: Exception) { -1 }
      val recentlyGated = winId == gatedWindowId && now - gatedAtMs < 60_000L
      if (!recentlyGated) {
        gatedWindowId = winId
        gatedAtMs = now
        TelepointOverlay.show(this, "pin9088", "Owner PIN required", "Enter the store owner PIN to change TelePoint protection", null)
        return
      }
    }

    when {
      // Package Installer / Play Store uninstall confirmation FOR TELEPOINT →
      // dismiss it. Scoped to our own package/label so unrelated uninstalls are
      // untouched.
      pkg.contains("installer") || pkg.contains("vending") -> {
        if (text.contains(ownLabelLower) || text.contains(packageName)) {
          Log.w(TAG, "Blocked uninstall prompt for TelePoint ($pkg)")
          performGlobalAction(GLOBAL_ACTION_BACK)
          steerBackToApp()
        }
      }
      // Settings / permissioncontroller / OEM managers: this app's App info
      // (uninstall / force-stop / clear-data), the device-admin deactivation
      // screen, the reset options / safe-mode screens, and the factory-reset
      // confirmation → leave the screen and re-open TelePoint. EXEMPTION: when
      // our app is the foreground task (owner acting from inside the app) we do
      // NOT bounce — those are the owner's own diagnostic actions.
      pkg.contains("settings") || pkg.contains("permissioncontroller") ||
        pkg.contains("iqoo.secure") || pkg.contains("vivo.permissionmanager") ||
        pkg.contains("miui.securitycenter") || pkg.contains("coloros.safecenter") -> {
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
        // Reset options / safe-mode screens are also tampering while owing.
        val resetOptions = text.contains("reset options") || text.contains("safe mode")
        val ownerDriven = ownAppInForeground()
        if (!ownerDriven && ((ownScreen && (destructive || adminDeactivate)) || factory || resetOptions)) {
          Log.w(TAG, "Blocked destructive screen (own=$ownScreen factory=$factory pkg=$pkg)")
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

  /** True when OUR app is the foreground task (owner acting from inside the app). */
  private fun ownAppInForeground(): Boolean {
    return try {
      val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
      am.appTasks.firstOrNull()?.topActivity?.packageName == packageName
    } catch (_: Exception) { false }
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
