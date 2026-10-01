package com.telepoint.devicemanagement

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Device-admin receiver for TelePoint EMI device management.
 *
 * Its presence + the user's explicit activation in the Android system dialog is
 * what grants force-lock. It performs no covert action: the callbacks only note
 * the enabled/disabled transitions so the JS layer can re-report status.
 *
 * It is also the Device Owner component: when the phone is provisioned as a
 * fully managed device via the setup-wizard QR (no ADB), the system calls
 * onProfileProvisioningComplete here to finalize enrollment.
 */
class TelepointDeviceAdminReceiver : DeviceAdminReceiver() {

  /**
   * Called by the system after a successful QR / managed provisioning, when this
   * app has just become the Device Owner. Finalize: whitelist ourselves for the
   * kiosk lock-task, default to uninstall-protected (EMI outstanding until the
   * app confirms otherwise), and launch the app to continue onboarding/login.
   */
  override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
    super.onProfileProvisioningComplete(context, intent)
    try {
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
      val admin = ComponentName(context, TelepointDeviceAdminReceiver::class.java)
      try { dpm.setLockTaskPackages(admin, arrayOf(context.packageName)) } catch (_: Exception) {}
      LockStateStore.setUninstallProtected(context, true)
      FinancingProtection.restore(context)
    } catch (_: Exception) { /* ignore */ }

    try {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      launch?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (launch != null) context.startActivity(launch)
    } catch (_: Exception) { /* ignore */ }
  }

  override fun onEnabled(context: Context, intent: Intent) {
    super.onEnabled(context, intent)
    // Admin activated by the user. Status is re-read by the app on next check.
  }

  override fun onDisabled(context: Context, intent: Intent) {
    super.onDisabled(context, intent)
    // User removed device admin. The app will detect ADMIN_INACTIVE and report.
  }

  /** Shown by the OS if the user tries to disable admin — plain, honest text. */
  override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
    return "This device is financed on EMI. Device management must stay on until your EMI is fully paid. " +
      "Please contact your retailer for help before turning this off."
  }
}
