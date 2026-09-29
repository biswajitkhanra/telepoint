package com.telepoint.devicemanagement

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast

/**
 * No-ADB uninstall protection for financed devices.
 *
 * The customer accepted, as a condition of the EMI purchase, that the TelePoint
 * app stays installed until the loan is fully paid. This service enforces that
 * WITHOUT root, ADB or Device Owner: while the EMI is still outstanding
 * (LockStateStore.isUninstallProtected), it watches for the system screens that
 * would remove the app — the package uninstaller confirmation for THIS app, and
 * the "deactivate device admin" screen for THIS app — and simply navigates back,
 * with a short explanation. Once the loan is COMPLETE/SETTLED the app clears the
 * protection flag and this service does nothing.
 *
 * It collects no data, reads no personal content, and only reacts to those two
 * specific system screens for this one package. It never blocks anything else.
 */
class TelepointAccessibilityService : AccessibilityService() {

  private val installerPackages = setOf(
    "com.android.packageinstaller",
    "com.google.android.packageinstaller",
    "com.miui.packageinstaller",
    "com.samsung.android.packageinstaller",
    "com.oppo.packageinstaller",
    "com.coloros.packageinstaller",
    "com.vivo.packageinstaller",
    "com.iqoo.packageinstaller",
  )

  private val main = Handler(Looper.getMainLooper())
  private var lastToastAt = 0L

  private fun myLabel(): String = try {
    applicationInfo.loadLabel(packageManager).toString()
  } catch (_: Exception) { "TelePoint" }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    // Only act while the financing agreement is still outstanding.
    if (!LockStateStore.isUninstallProtected(this)) return

    val pkg = event.packageName?.toString() ?: return
    val label = myLabel()

    // 1) Uninstall confirmation dialog that references this app.
    if (pkg in installerPackages) {
      val root = rootInActiveWindow ?: return
      val hit = nodeHasText(root, label) || nodeHasText(root, packageName)
      root.recycle()
      if (hit) { bounce("This device is on EMI. The app can’t be removed until your EMI is fully paid."); return }
    }

    // 2) "Deactivate device admin" screen for this app (uninstall needs this off
    //    first). The same screen is used to ENABLE admin during setup, so only
    //    block when it is clearly the deactivate/turn-off variant.
    if (pkg == "com.android.settings") {
      val cls = event.className?.toString() ?: ""
      if (cls.contains("DeviceAdmin", true)) {
        val root = rootInActiveWindow ?: return
        val mine = nodeHasText(root, label)
        val deactivate = nodeHasText(root, "Deactivate") || nodeHasText(root, "Turn off") || nodeHasText(root, "Remove")
        root.recycle()
        if (mine && deactivate) { bounce("Device management must stay on until your EMI is fully paid."); }
      }
    }
  }

  private fun bounce(message: String) {
    performGlobalAction(GLOBAL_ACTION_BACK)
    val now = System.currentTimeMillis()
    if (now - lastToastAt > 2500) {
      lastToastAt = now
      main.post { Toast.makeText(applicationContext, message, Toast.LENGTH_LONG).show() }
    }
  }

  /** Case-insensitive substring search over a node subtree. Recycles children. */
  private fun nodeHasText(node: AccessibilityNodeInfo?, needle: String): Boolean {
    if (node == null || needle.isEmpty()) return false
    val text = node.text?.toString()
    val desc = node.contentDescription?.toString()
    if ((text != null && text.contains(needle, true)) || (desc != null && desc.contains(needle, true))) return true
    for (i in 0 until node.childCount) {
      val child = node.getChild(i)
      val found = nodeHasText(child, needle)
      child?.recycle()
      if (found) return true
    }
    return false
  }

  override fun onInterrupt() { /* no-op */ }
}
