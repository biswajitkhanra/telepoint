package com.telepoint.devicemanagement

import android.app.admin.FactoryResetProtectionPolicy
import android.content.Context
import android.os.Build
import android.os.UserManager

/** Device Owner policy, shared by enrollment, boot and the authenticated app sync. */
object FinancingProtection {
  fun supportsFrp(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || !DeviceActions.isOwner(c)) return false
    return try { DeviceActions.dpm(c).getFactoryResetProtectionPolicy(DeviceActions.admin(c)); true }
      catch (_: Exception) { false }
  }
  private val restrictions = listOf(
    UserManager.DISALLOW_FACTORY_RESET,
    UserManager.DISALLOW_SAFE_BOOT,
    UserManager.DISALLOW_ADD_USER,
    UserManager.DISALLOW_CONFIG_DATE_TIME,
    // USB/ADB hardening: blocks debugging features so a cable cannot be used to
    // force-stop/clear the collateral app while the EMI is outstanding.
    UserManager.DISALLOW_DEBUGGING_FEATURES,
  )

  fun apply(c: Context, active: Boolean, accounts: List<String>): Map<String, Any?> {
    if (!DeviceActions.isOwner(c)) {
      return mapOf("applied" to false, "reason" to "requires_device_owner")
    }
    val d = DeviceActions.dpm(c)
    val a = DeviceActions.admin(c)
    val failures = mutableListOf<String>()
    fun attempt(name: String, action: () -> Unit) {
      try { action() } catch (_: Exception) { failures.add(name) }
    }
    // Remember the requested policy so reboot can retry partial OS failures.
    LockStateStore.setUninstallProtected(c, active)
    c.getSharedPreferences("telepoint_financing", Context.MODE_PRIVATE).edit()
      .putStringSet("frp_accounts", accounts.toSet()).commit()

    attempt("uninstall") { d.setUninstallBlocked(a, c.packageName, active) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      attempt("user_control") {
        d.setUserControlDisabledPackages(a, if (active) listOf(c.packageName) else emptyList())
      }
    }
    for (restriction in restrictions) {
      attempt(restriction) {
        if (active) d.addUserRestriction(a, restriction) else d.clearUserRestriction(a, restriction)
      }
    }

    // Accessibility is CONSENT-BASED and ON-DEVICE ONLY: the owner/store enables
    // the TelePoint accessibility service with the real system toggle at
    // provisioning. The app only CONFIRMS the live state (PIN-9088 / heartbeat);
    // it does not silently enable it or restrict other accessibility services.
    // On release we clear any restriction a previous build may have set.
    if (!active) {
      attempt("permitted_accessibility") { d.setPermittedAccessibilityServices(a, null) }
    }

    val frpSupported = supportsFrp(c)
    var frpApplied = false
    // Honest gaps: while the loan is active, FRP must never be silently skipped.
    // On an API 30+ Device Owner whose OEM rejects the policy API, and when no
    // numeric Gaia account is configured, report the gap instead of claiming
    // full protection (the sync/heartbeat must see policy_not_applied).
    if (active && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !frpSupported) {
      failures.add("frp_apply")
    } else if (active && frpSupported && accounts.isEmpty()) {
      failures.add("frp_accounts_missing")
    }
    if (frpSupported && (!active || accounts.isNotEmpty())) {
      try {
        val policy = FactoryResetProtectionPolicy.Builder()
          .setFactoryResetProtectionEnabled(active)
          .setFactoryResetProtectionAccounts(if (active) accounts else emptyList())
          .build()
        // Explicitly disable on release; null restores the platform default.
        d.setFactoryResetProtectionPolicy(a, policy)
        // Only treat FRP as still-on when the OS explicitly reports it enabled.
        // A null policy after a disable means "no FRP" (the platform default),
        // which for release is the desired end state — not a failure.
        val enabledNow = d.getFactoryResetProtectionPolicy(a)?.isFactoryResetProtectionEnabled == true
        frpApplied = enabledNow == active
        if (active && !frpApplied) failures.add("frp_readback")
        // On release, only block the release when FRP is provably STILL on; an
        // unreadable/absent policy must not trap an already-paid customer.
        if (!active && enabledNow) failures.add("frp_release")
      } catch (_: Exception) {
        // Applying FRP matters (it is the anti-wipe deterrent); a failed disable
        // is best-effort and must not, by itself, block the full release.
        if (active) {
          failures.add("frp_apply")
        } else {
          // The disable threw: re-read the OS. If FRP is provably STILL on, do
          // not let release proceed to clearDeviceOwnerApp with financer
          // accounts attached — report release_incomplete and retry next sync.
          try {
            val stillOn = d.getFactoryResetProtectionPolicy(a)?.isFactoryResetProtectionEnabled == true
            if (stillOn) failures.add("frp_release")
          } catch (_: Exception) {}
        }
      }
    }
    // Read the OS back instead of reporting success just because we tried.
    attempt("verify") {
      if (d.isUninstallBlocked(a, c.packageName) != active) failures.add("uninstall_readback")
      val applied = d.getUserRestrictions(a)
      for (restriction in restrictions) {
        if (applied.getBoolean(restriction, false) != active) failures.add("${restriction}_readback")
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
        d.getUserControlDisabledPackages(a).contains(c.packageName) != active) {
        failures.add("user_control_readback")
      }
    }
    return mapOf(
      "applied" to failures.isEmpty(), "mode" to "DEVICE_OWNER", "active" to active,
      "reason" to if (failures.isEmpty()) null else "policy_not_applied",
      "failedPolicies" to failures.distinct(), "frpApplied" to frpApplied,
      "frpSupported" to frpSupported, "accountsConfigured" to accounts.size,
      "sdkInt" to Build.VERSION.SDK_INT,
    )
  }

  fun restore(c: Context) {
    if (!DeviceActions.isOwner(c) || !LockStateStore.isUninstallProtected(c)) return
    val accounts = c.getSharedPreferences("telepoint_financing", Context.MODE_PRIVATE)
      .getStringSet("frp_accounts", emptySet())?.toList() ?: emptyList()
    apply(c, true, accounts)
  }
}
