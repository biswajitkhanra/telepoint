package com.telepoint.devicemanagement

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.os.UserManager
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Native foreground command-delivery service.
 *
 * WHY THIS EXISTS: the JS `deviceSync` poll only runs while the React app is
 * open, so an online LOCK sent from the admin panel used to wait until the
 * customer opened the app. This service polls `/api/device/commands` natively on
 * its own schedule, executes the authorised command immediately (lock/unlock/
 * device actions) and acknowledges it — with the app fully closed.
 *
 * It uses only documented Android APIs and the same server authority as the JS
 * path (the backend owns the confirmed state; the service only executes commands
 * the backend marked PENDING/RECEIVED for this exact install). It is a Device
 * Owner / DPC, so it may start a foreground service from BOOT_COMPLETED.
 *
 * While locked, `DeviceActions.hardLock` also (re)launches the app; Android
 * permits a background activity start when the app holds SYSTEM_ALERT_WINDOW,
 * which is why the diagnostic panel asks the owner to grant "Display over other
 * apps" — so the lock screen appears immediately over whatever is on screen.
 */
class TelepointCommandService : Service() {

  private var executor: ScheduledExecutorService? = null
  private var scheduled = false

  /** Until this time the poll runs at the fast (burst) cadence. */
  @Volatile private var burstUntil: Long = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = true
    ensureChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startInForeground()
    if (!CommandServiceStore.isConfigured(this)) {
      // Nothing to do yet (e.g. booted before first login) — do not keep a
      // foreground service alive without config.
      stopSelf()
      return START_NOT_STICKY
    }
    if (!scheduled) {
      val ex = Executors.newSingleThreadScheduledExecutor()
      executor = ex
      scheduleNext(ex)
      scheduled = true
    }
    return START_STICKY
  }

  /**
   * Self-rescheduling poll. Idle 30 s; but poll fast (6 s) while a lock is in
   * force or for a minute after any command, so a portal UNLOCK reaches a locked
   * phone within seconds instead of up to half a minute.
   */
  private fun scheduleNext(ex: ScheduledExecutorService) {
    if (ex.isShutdown) return
    val fast = LockStateStore.isLocked(this) || System.currentTimeMillis() < burstUntil
    val delay = if (fast) BURST_SECONDS else POLL_SECONDS
    try {
      ex.schedule({
        try { tick() } catch (_: Throwable) { /* never kill the loop */ }
        scheduleNext(ex)
      }, delay, TimeUnit.SECONDS)
    } catch (_: Exception) { /* executor shutting down */ }
  }

  override fun onDestroy() {
    running = false
    try { executor?.shutdownNow() } catch (_: Exception) {}
    executor = null
    scheduled = false
    super.onDestroy()
  }

  private fun startInForeground() {
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // A SecurityException here (e.g. FGS type not permitted on an unusual OEM)
      // must not crash; the service simply runs without the foreground flag.
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Device protection",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps EMI device-management commands working while the app is closed"
      setShowBadge(false)
    }
    mgr.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val smallIcon = try { applicationInfo.icon } catch (_: Exception) { android.R.drawable.ic_dialog_info }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    var contentIntent: PendingIntent? = null
    if (launch != null) {
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      var flags = PendingIntent.FLAG_UPDATE_CURRENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
      contentIntent = PendingIntent.getActivity(this, 0, launch, flags)
    }
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(if (smallIcon != 0) smallIcon else android.R.drawable.ic_dialog_info)
      .setContentTitle("TelePoint protection active")
      .setContentText("Monitoring EMI device management")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
    contentIntent?.let { builder.setContentIntent(it) }
    return builder.build()
  }

  // --- polling ---------------------------------------------------------------

  private fun tick() {
    val baseUrl = CommandServiceStore.getBaseUrl(this) ?: return
    val customerId = CommandServiceStore.getCustomerId(this) ?: return
    val installationId = CommandServiceStore.getInstallationId(this) ?: return
    val token = CommandServiceStore.getToken(this) ?: return

    val body = JSONObject()
      .put("customer_id", customerId)
      .put("session_token", token)
      .put("installation_id", installationId)
    val resp = postJson("$baseUrl/api/device/commands", body) ?: return

    val loanStatus = resp.optString("loan_status", "")
    if (loanStatus == "COMPLETE" || loanStatus == "SETTLED") {
      coreRelease()
      return
    }

    // Keep the collateral protection fresh while the loan is outstanding, even
    // if the app has not been opened since a reboot/reinstall.
    if (loanStatus == "RUNNING" || loanStatus == "NPA") {
      try { FinancingProtection.apply(this, true, CommandServiceStore.getFrpAccounts(this)) } catch (_: Exception) {}
    }

    val commands = resp.optJSONArray("commands") ?: return
    // Any pending command → poll fast briefly so the follow-up/ack is quick.
    if (commands.length() > 0) burstUntil = System.currentTimeMillis() + BURST_WINDOW_MS
    for (i in 0 until commands.length()) {
      val cmd = commands.optJSONObject(i) ?: continue
      val status = cmd.optString("status", "")
      if (status != "PENDING" && status != "RECEIVED") continue
      val id = cmd.optString("id", "")
      if (id.isBlank()) continue
      val type = cmd.optString("command_type", "")
      // Unlock-wins guard: a LOCK issued BEFORE the last local unlock (backend
      // UNLOCK, offline TOTP, or offline SMS UNLOCK) is stale — ack SUPERSEDED
      // instead of re-locking. A LOCK issued AFTER it still executes every time.
      if (type == "LOCK") {
        val createdMs = epochOfIso(cmd.optString("created_at", ""))
        val lastUnlock = LockStateStore.getLastUnlockedAt(this)
        if (lastUnlock > 0L && createdMs > 0L && createdMs <= lastUnlock) {
          ack(baseUrl, customerId, installationId, token, id, "SUPERSEDED")
          continue
        }
      }
      var handled = true
      when (type) {
        "LOCK" -> executeLock()
        "UNLOCK" -> executeUnlock()
        "RELEASE" -> { coreRelease() }
        "DEVICE_ACTION" -> handled = runDeviceAction(cmd.optJSONObject("payload"))
        // EMI_REMINDER is rich (photo + Bengali/Hindi voice) and is delivered by
        // the app UI; LOCATION/SIM_INFO must report back to the server through the
        // JS heartbeat. Leave those for the app so this service stays focused.
        else -> handled = false
      }
      if (handled) ack(baseUrl, customerId, installationId, token, id, "EXECUTED")
    }
  }

  private fun executeLock() {
    DeviceActions.hardLock(this)
    try { LockPolicies.apply(this, true) } catch (_: Exception) {}
    burstUntil = System.currentTimeMillis() + BURST_WINDOW_MS
  }

  private fun executeUnlock() {
    try { LockPolicies.apply(this, false) } catch (_: Exception) {}
    DeviceActions.releaseLock(this)
  }

  /** Full local release once the loan is closed; the JS app removes Device Owner. */
  private fun coreRelease() {
    try { LockPolicies.apply(this, false) } catch (_: Exception) {}
    try { DeviceActions.releaseManagedRestrictions(this) } catch (_: Exception) {}
    try { FinancingProtection.apply(this, false, emptyList()) } catch (_: Exception) {}
    try { TelepointAccessibilityService.disableBestEffort(this) } catch (_: Exception) {}
    try { AppLockStore.clear(this) } catch (_: Exception) {}
    TelepointOverlay.dismiss(this)
    try { LockStateStore.setUninstallProtected(this, false) } catch (_: Exception) {}
    LockStateStore.setLastUnlockedAt(this, System.currentTimeMillis())
    try { CommandServiceStore.clear(this) } catch (_: Exception) {}
    stopSelf()
  }

  /** Parse a UTC ISO-8601 timestamp to epoch millis; 0 when unparseable. */
  private fun epochOfIso(s: String?): Long {
    if (s.isNullOrBlank()) return 0L
    val t = s.trim().replace("Z", "+0000")
    val patterns = listOf(
      "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXX", "yyyy-MM-dd'T'HH:mm:ss.SSSXX", "yyyy-MM-dd'T'HH:mm:ssXX",
    )
    for (p in patterns) {
      try {
        val f = java.text.SimpleDateFormat(p, java.util.Locale.US).apply { isLenient = false }
        return f.parse(t)?.time ?: 0L
      } catch (_: Exception) { /* try next pattern */ }
    }
    return 0L
  }

  private fun runDeviceAction(payload: JSONObject?): Boolean {
    if (payload == null) return false
    val action = payload.optString("action", "")
    val enabled = payload.optBoolean("enabled", true)
    val owner = DeviceActions.isOwner(this)
    return when (action) {
      "REBOOT" -> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) false
        else try { DeviceActions.dpm(this).reboot(DeviceActions.admin(this)); true } catch (_: Exception) { false }
      }
      "WIFI_POWER" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !owner) false
        else try {
          @Suppress("DEPRECATION")
          (getSystemService(Context.WIFI_SERVICE) as WifiManager).setWifiEnabled(enabled == true)
          true
        } catch (_: Exception) { false }
      }
      "AIRPLANE_POWER" -> {
        if (!owner) false
        else DeviceActions.setAirplaneMode(this, enabled == true) != "unsupported"
      }
      "APP_HIDE" -> {
        val pkg = payload.optString("package", "")
        if (pkg.isNotBlank()) {
          try { DeviceActions.dpm(this).setApplicationHidden(DeviceActions.admin(this), pkg, enabled != false); true }
          catch (_: Exception) { false }
        } else {
          DeviceActions.hideAllUserApps(this, enabled != false) >= 0
        }
      }
      "TRACKING" -> { TrackingStore.setEnabled(this, enabled == true); true }
      "APP_LOCK" -> {
        val arr = payload.optJSONArray("packages") ?: JSONArray()
        val pkgs = ArrayList<String>()
        for (i in 0 until arr.length()) arr.optString(i, "").takeIf { it.isNotBlank() }?.let { pkgs.add(it) }
        if (pkgs.isEmpty()) false
        else try {
          DeviceActions.dpm(this).setPackagesSuspended(DeviceActions.admin(this), pkgs.toTypedArray(), enabled != false)
          true
        } catch (_: Exception) { false }
      }
      "APP_PIN_LOCK" -> {
        val arr = payload.optJSONArray("packages") ?: JSONArray()
        val pkgs = ArrayList<String>()
        for (i in 0 until arr.length()) arr.optString(i, "").takeIf { it.isNotBlank() }?.let { pkgs.add(it) }
        val pin = payload.optString("pin", "")
        if (pkgs.isEmpty() || pin.isBlank()) false
        else {
          AppLockStore.setLockedPackages(this, pkgs)
          AppLockStore.setPin(this, pin)
          AppLockStore.setEnabled(this, enabled != false)
          true
        }
      }
      "CAMERA" -> try {
        DeviceActions.dpm(this).setCameraDisabled(DeviceActions.admin(this), enabled == true); true
      } catch (_: Exception) { false }
      "BLUETOOTH" -> restriction(UserManager.DISALLOW_BLUETOOTH, enabled == true)
      "WIFI" -> restriction(UserManager.DISALLOW_CONFIG_WIFI, enabled == true)
      "USB" -> restriction(UserManager.DISALLOW_USB_FILE_TRANSFER, enabled == true)
      "AIRPLANE" -> restriction(UserManager.DISALLOW_AIRPLANE_MODE, enabled == true)
      "OUTGOING_CALLS" -> restriction(UserManager.DISALLOW_OUTGOING_CALLS, enabled == true)
      "WALLPAPER" -> restriction(UserManager.DISALLOW_SET_WALLPAPER, enabled == true)
      else -> false
    }
  }

  private fun restriction(restriction: String, restrict: Boolean): Boolean {
    if (!DeviceActions.isOwner(this)) return false
    return try {
      val d = DeviceActions.dpm(this); val a = DeviceActions.admin(this)
      if (restrict) d.addUserRestriction(a, restriction) else d.clearUserRestriction(a, restriction)
      true
    } catch (_: Exception) { false }
  }

  private fun ack(baseUrl: String, customerId: String, installationId: String, token: String, commandId: String, result: String) {
    val body = JSONObject()
      .put("customer_id", customerId)
      .put("session_token", token)
      .put("installation_id", installationId)
      .put("command_id", commandId)
      .put("result", result)
    postJson("$baseUrl/api/device/command/ack", body)
  }

  /** Minimal JSON POST using HttpURLConnection — no extra dependency. */
  private fun postJson(url: String, body: JSONObject): JSONObject? {
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 20_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
        setRequestProperty("Accept", "application/json")
      }
      OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
      val code = conn.responseCode
      if (code !in 200..299) return null
      val text = BufferedReader(conn.inputStream.reader(Charsets.UTF_8)).use { it.readText() }
      if (text.isBlank()) null else JSONObject(text)
    } catch (_: Exception) {
      null
    } finally {
      try { conn?.disconnect() } catch (_: Exception) {}
    }
  }

  companion object {
    @Volatile var running: Boolean = false
      private set

    private const val CHANNEL_ID = "telepoint-command-service"
    private const val NOTIFICATION_ID = 42425
    private const val POLL_SECONDS = 30L
    private const val BURST_SECONDS = 6L
    private const val BURST_WINDOW_MS = 60_000L

    fun start(context: Context) {
      val intent = Intent(context, TelepointCommandService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
      } catch (_: Exception) { /* OEM restriction — retried on next foreground */ }
    }

    fun stop(context: Context) {
      try { context.stopService(Intent(context, TelepointCommandService::class.java)) } catch (_: Exception) {}
    }
  }
}
