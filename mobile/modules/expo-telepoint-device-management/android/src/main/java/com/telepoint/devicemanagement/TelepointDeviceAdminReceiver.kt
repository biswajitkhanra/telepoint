package com.telepoint.devicemanagement

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * Device-admin receiver for TelePoint EMI device management.
 *
 * Its presence + the user's explicit activation in the Android system dialog is
 * what grants force-lock. It performs no covert action: the callbacks only note
 * the enabled/disabled transitions so the JS layer can re-report status.
 */
class TelepointDeviceAdminReceiver : DeviceAdminReceiver() {
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
