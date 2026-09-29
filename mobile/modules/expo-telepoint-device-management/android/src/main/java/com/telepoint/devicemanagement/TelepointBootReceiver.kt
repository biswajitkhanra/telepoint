package com.telepoint.devicemanagement

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Re-applies the EMI lock after a reboot.
 *
 * A financed device that was locked must come back locked — otherwise a simple
 * restart would defeat the collateral protection. On BOOT_COMPLETED, if the
 * persisted state says LOCKED, this:
 *   • re-asserts the screen lock (lockNow) when this app is an active admin, and
 *   • relaunches the app so its lock screen is shown.
 * When this app is the Device Owner it is also set as the HOME launcher while
 * locked (see the module), so the device already boots straight into the lock
 * screen; the lockNow here is belt-and-braces.
 *
 * It does nothing when the account is not locked. It performs no covert action
 * and collects no data.
 */
class TelepointBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON"
    ) return

    if (!LockStateStore.isLocked(context)) return

    // Re-assert the screen lock if we are an active admin.
    try {
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
      val admin = ComponentName(context, TelepointDeviceAdminReceiver::class.java)
      if (dpm.isAdminActive(admin)) dpm.lockNow()
    } catch (_: Exception) { /* ignore */ }

    // Relaunch the app so its own lock screen is shown to the user.
    try {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        context.startActivity(launch)
      }
    } catch (_: Exception) { /* ignore */ }
  }
}
