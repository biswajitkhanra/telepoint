package com.telepoint.devicemanagement

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * TelePoint consent-based EMI device management (Android).
 *
 * Uses only documented, supported Android APIs (DevicePolicyManager /
 * DeviceAdminReceiver). It never bypasses the system permission dialog, never
 * silently enables admin, never uses root / accessibility / hidden APIs, and
 * never impersonates Android system UI.
 *
 * Capability is gated by the device's management mode:
 *   UNMANAGED      → no lock capability (report honestly; guide enrollment)
 *   DEVICE_ADMIN   → force-lock supported (lockNow) — the personal-device path
 *   PROFILE_OWNER  → work profile; cannot lock the whole personal device
 *   DEVICE_OWNER   → fully managed; force-lock supported
 * We implement the strongest LEGITIMATE operation the current mode supports and
 * report the mode so the app can explain any limitation.
 */
class ExpoTelepointDeviceManagementModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val dpm: DevicePolicyManager
    get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private val adminComponent: ComponentName
    get() = ComponentName(context, TelepointDeviceAdminReceiver::class.java)

  override fun definition() = ModuleDefinition {
    Name("ExpoTelepointDeviceManagement")

    AsyncFunction("isDeviceAdminEnabled") {
      dpm.isAdminActive(adminComponent)
    }

    // Opens the OS "activate device admin" dialog. Cannot grant by itself.
    AsyncFunction("requestDeviceAdmin") {
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
        putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
        putExtra(
          DevicePolicyManager.EXTRA_ADD_EXPLANATION,
          "TelePoint uses this permission to lock this financed device when your EMI is overdue. " +
            "The lock screen shows your amount due and store contact. You can remove it anytime in Settings."
        )
      }
      activity.startActivity(intent)
    }

    AsyncFunction("openDeviceAdminSettings") {
      val intent = Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    // The device's current management mode (see class doc).
    AsyncFunction("getManagementMode") {
      currentMode()
    }

    AsyncFunction("getDeviceManagementStatus") {
      val mode = currentMode()
      val adminActive = dpm.isAdminActive(adminComponent)
      val canLock = mode == "DEVICE_ADMIN" || mode == "DEVICE_OWNER"
      mapOf(
        "adminActive" to adminActive,
        "mode" to mode,
        "state" to if (adminActive) "ADMIN_ACTIVE" else "ADMIN_INACTIVE",
        "canLock" to canLock
      )
    }

    AsyncFunction("getDeviceInfo") {
      mapOf(
        "manufacturer" to (Build.MANUFACTURER ?: ""),
        "model" to (Build.MODEL ?: ""),
        "androidVersion" to (Build.VERSION.RELEASE ?: ""),
        "sdkInt" to Build.VERSION.SDK_INT
      )
    }

    // Re-assert the lock. On a stock personal device (DEVICE_ADMIN) Android
    // lets the user unlock their own screen, so the app calls this on every
    // foreground while the account is LOCKED — a single unlock does not defeat
    // the lock. Documented lockNow() only; returns whether it locked.
    AsyncFunction("lockNow") {
      val mode = currentMode()
      val canLock = mode == "DEVICE_ADMIN" || mode == "DEVICE_OWNER"
      if (!dpm.isAdminActive(adminComponent) || !canLock) return@AsyncFunction false
      try { dpm.lockNow(); true } catch (e: SecurityException) { false }
    }

    // Force-lock via the documented lockNow() when the mode supports it.
    AsyncFunction("executeAuthorizedLock") { commandId: String ->
      val mode = currentMode()
      val canLock = mode == "DEVICE_ADMIN" || mode == "DEVICE_OWNER"
      if (!dpm.isAdminActive(adminComponent)) {
        return@AsyncFunction mapOf("ok" to false, "commandId" to commandId, "reason" to "admin_inactive")
      }
      if (!canLock) {
        return@AsyncFunction mapOf("ok" to false, "commandId" to commandId, "reason" to "mode_unsupported:$mode")
      }
      try {
        // Fully managed (DEVICE_OWNER): also block uninstall so the app — and
        // therefore the lock — cannot simply be removed. This is only possible
        // in device-owner mode; on DEVICE_ADMIN the user may still revoke admin
        // (an Android guarantee we do not, and cannot, bypass).
        if (mode == "DEVICE_OWNER") {
          try { dpm.setUninstallBlocked(adminComponent, context.packageName, true) } catch (_: Exception) {}
        }
        dpm.lockNow()
        mapOf("ok" to true, "commandId" to commandId, "mode" to mode)
      } catch (e: SecurityException) {
        mapOf("ok" to false, "commandId" to commandId, "reason" to "security_exception")
      }
    }

    // No forced screen-unlock exists for a plain device admin; clearing the
    // app-managed state hands control back to the user's own screen lock. The
    // JS layer reports COMPLETED so the backend leaves the LOCKED state.
    AsyncFunction("executeAuthorizedUnlock") { commandId: String ->
      if (!dpm.isAdminActive(adminComponent)) {
        return@AsyncFunction mapOf("ok" to false, "commandId" to commandId, "reason" to "admin_inactive")
      }
      val mode = currentMode()
      mapOf("ok" to true, "commandId" to commandId, "mode" to mode)
    }

    // Keep the app un-removable while the EMI is outstanding (the customer's
    // financing agreement). This ONLY works when the device is enrolled as
    // DEVICE_OWNER (fully managed) — the supported Android way to block
    // uninstall of a package. On a normal device-admin phone Android does not
    // allow blocking uninstall, so this returns applied=false and the app says
    // so honestly. The app collects no personal data; it just stays installed
    // and lockable until the EMI is cleared.
    AsyncFunction("setUninstallProtection") { active: Boolean ->
      val mode = currentMode()
      if (mode != "DEVICE_OWNER") {
        return@AsyncFunction mapOf("applied" to false, "mode" to mode, "reason" to "requires_device_owner")
      }
      try {
        dpm.setUninstallBlocked(adminComponent, context.packageName, active)
        mapOf("applied" to true, "mode" to mode, "blocked" to active)
      } catch (e: Exception) {
        mapOf("applied" to false, "mode" to mode, "reason" to "exception")
      }
    }
  }

  private fun currentMode(): String {
    return when {
      dpm.isDeviceOwnerApp(context.packageName) -> "DEVICE_OWNER"
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
        dpm.isProfileOwnerApp(context.packageName) -> "PROFILE_OWNER"
      dpm.isAdminActive(adminComponent) -> "DEVICE_ADMIN"
      else -> "UNMANAGED"
    }
  }
}
