# TelePoint — Android Permission Reference & Gap Analysis

Authoritative, cited permission reference for the **TelePoint Customer app**, a legitimate,
consent-based **Device-Owner** EMI / device-financing app (financed devices under a signed
agreement, enrolled as Device Owner via QR/afw provisioning).

Scope: this document covers the **Customer** app (`com.telepoint.customer`, `appVariant: customer`),
which holds all the sensitive capabilities. The **Retailer** app is a WebView portal and needs
almost nothing (see [§7](#7-customer-vs-retailer-app)).

Last researched: 2026-09-30. All sources are official Android developer / AOSP / Google Play
Console documentation, linked inline.

---

## 1. How to read this

- **Protection level** — `normal` (auto-granted at install), `dangerous` (runtime, user-grantable),
  `signature` (only apps signed with the platform/defining cert), `special`/`appop`
  (Settings → Special app access), or **none** (capability gated by Device-Owner status, not a
  permission). Levels are from the
  [`Manifest.permission` reference](https://developer.android.com/reference/android/Manifest.permission).
- **DO auto-grant** — whether a **Device Owner** can silently grant it with
  [`DevicePolicyManager.setPermissionGrantState()`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setPermissionGrantState(android.content.ComponentName,%20java.lang.String,%20java.lang.String,%20int)).
  This works **only for runtime (`dangerous`) permissions**. It does **not** work for `normal`
  perms (already granted), `signature` perms, or `appop`/special perms (e.g. `SCHEDULE_EXACT_ALARM`).

---

## 2. Capability → permission map

| Capability | Permission(s) | Protection | DO auto-grant? | In current set? |
|---|---|---|---|---|
| Device admin/owner lock, wipe, kiosk | `BIND_DEVICE_ADMIN` (on the receiver, not `uses-permission`) | signature | n/a (enforced on receiver) | Yes (native manifest) |
| **Anti-tamper / uninstall-reset deterrent / per-app lock overlay — REQUIRED** | `BIND_ACCESSIBILITY_SERVICE` (on the `<service>`, not `uses-permission`) | signature | n/a (enabled via the OS Accessibility toggle, or DO `setSecureSetting` + real readback) | Yes (declared in the module manifest + `res/xml`) |
| Camera-disable, reboot, app-hide, user restrictions, FRP | **none** (DevicePolicyManager, gated by DO status) | none | n/a | Correctly none |
| Exact-alarm EMI reminders | `SCHEDULE_EXACT_ALARM` and/or `USE_EXACT_ALARM` | appop(special) / normal | No (appop) / n/a (normal) | Both declared |
| Notifications (Android 13+) | `POST_NOTIFICATIONS` | dangerous | **Yes** | Yes |
| Re-lock / reschedule after reboot/timezone | `RECEIVE_BOOT_COMPLETED` | normal | n/a | Yes |
| Offline SMS lock/unlock | `RECEIVE_SMS` | dangerous | **Yes** | Yes |
| TTS due-day voice | **none** | none | n/a | Correctly none |
| Customer photo download + notification | `INTERNET` (+ `ACCESS_NETWORK_STATE`) | normal | n/a | See [§5](#5-internet--network-state) |
| Location on demand (foreground) | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | dangerous | **Yes** | Yes |
| Location while app backgrounded (sync cadence) | **`ACCESS_BACKGROUND_LOCATION`** | dangerous | **Yes** (see [§6](#6-background-location--foreground-service-the-key-decision)) | **NO — gap** |
| SIM info (carrier/number/slot) | `READ_PHONE_STATE`, `READ_PHONE_NUMBERS` | dangerous | **Yes** | Yes |
| Wi-Fi power ON/OFF (DO) | `CHANGE_WIFI_STATE`, `ACCESS_WIFI_STATE` | normal | n/a | Yes |
| Keep CPU awake for alarm/notify/TTS | `WAKE_LOCK` | normal | n/a | Yes |
| Notification vibration | `VIBRATE` | normal | n/a | Yes |
| Keep background delivery alive | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | normal | n/a | Yes (see [§6](#6-background-location--foreground-service-the-key-decision)) |
| Tracking via a persistent service (only if adopted) | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` | normal | n/a | No — **not needed by current design** |
| Enumerate user apps for hide-all | **none** (DO is exempt from package-visibility filtering) | none | n/a | Correctly none — do **not** add `QUERY_ALL_PACKAGES` |

---

## 3. Per-permission detail

### BIND_DEVICE_ADMIN — signature
Enforced as the `android:permission` attribute on `TelepointDeviceAdminReceiver`, **not** as a
`<uses-permission>`. It guarantees only the OS DevicePolicy subsystem can bind the receiver.
Correctly declared in the device-management module manifest with `android:exported="true"`.
Ref: [Manifest.permission#BIND_DEVICE_ADMIN](https://developer.android.com/reference/android/Manifest.permission#BIND_DEVICE_ADMIN),
[Device admin overview](https://developer.android.com/guide/topics/admin/device-admin).

### BIND_ACCESSIBILITY_SERVICE — signature (REQUIRED)
The owner-authorized `TelepointAccessibilityService` is a **mandatory** component of the
financed-device protection: it is an additional deterrent that steers away from the
uninstall / force-stop / clear-data / Settings-tampering screens and powers the per-app
lock overlay. It is declared as the `android:permission` attribute on the `<service>` (not
as a `<uses-permission>`) with the
`android.accessibilityservice.AccessibilityService` intent-filter and
`res/xml/telepoint_accessibility_service.xml`. It is enabled by the owner/store via the
real OS Accessibility toggle (Device Owner best-effort `setSecureSetting`, then the user
toggle) and verified by a real readback — it is **never** enabled by faking policy state
or intercepting the consent dialog. `BIND_ACCESSIBILITY_SERVICE` is a signature binding
permission, so the user must grant service access through Settings while the app itself
cannot self-grant it. It does **not** replace Device Owner (the guaranteed uninstall/reset
block) and cannot block a hardware/recovery wipe.
Ref: [AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService),
[Manifest.permission#BIND_ACCESSIBILITY_SERVICE](https://developer.android.com/reference/android/Manifest.permission#BIND_ACCESSIBILITY_SERVICE).

### All other DevicePolicyManager actions — no manifest permission
`setCameraDisabled`, `reboot()`, `setApplicationHidden`, `addUserRestriction`
(`DISALLOW_FACTORY_RESET`, `DISALLOW_SAFE_BOOT`, `DISALLOW_CONFIG_BLUETOOTH`,
`DISALLOW_USB_FILE_TRANSFER`, `DISALLOW_AIRPLANE_MODE`, `DISALLOW_OUTGOING_CALLS`,
`DISALLOW_SET_WALLPAPER`, `DISALLOW_CONFIG_WIFI` …), factory-reset-protection policy, and
lock-task/kiosk are all **gated by Device-Owner status, not by a manifest permission**. Declaring
none of these is correct. Refs:
[DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager),
[UserManager restrictions](https://developer.android.com/reference/android/os/UserManager),
[Fully managed device features](https://developer.android.com/work/dpc/dedicated-devices).

### SCHEDULE_EXACT_ALARM (appop/special) & USE_EXACT_ALARM (normal)
Both signal the same capability but differ in grant + policy
([Schedule exact alarms](https://developer.android.com/develop/background-work/services/alarms/schedule#exact-permission-declare)):
- **`SCHEDULE_EXACT_ALARM`** — "Alarms & reminders" special app access. Auto-granted on installs
  targeting API 31/32; **denied by default** and user-grantable on installs targeting **API 33+**
  ([Android 14 change](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)).
  Protection level moved from `normal|appop` to `appop`. **A Device Owner CANNOT pre-grant this via
  `setPermissionGrantState`** (it is an appop/special access, not a runtime permission). Broad set of
  legitimate use cases.
- **`USE_EXACT_ALARM`** — protection level `normal`, always granted at install, cannot be revoked.
  **But it is a Google-Play-restricted permission**: only apps whose *core* purpose is an alarm
  clock or a calendar may declare it on the public Play Store
  ([exact-alarm policy](https://support.google.com/googleplay/android-developer/answer/12253906#exact_alarm_preview)).
  An EMI app is not an alarm-clock/calendar app, so `USE_EXACT_ALARM` is a **public-Play rejection
  risk**.

Recommendation: keep **`SCHEDULE_EXACT_ALARM`** (correct for reminder use). Declaring both is
redundant. Drop `USE_EXACT_ALARM` if the app is ever published on the public Play Store; it is
acceptable only under private/managed distribution. Always guard with `canScheduleExactAlarms()`
and route users to the special-access screen if denied. The `setExactAndAllowWhileIdle` design is
correct; no foreground service is implied by it.

### POST_NOTIFICATIONS — dangerous (API 33 / Android 13)
Runtime permission introduced in Android 13; on 13+ **notifications are OFF by default** until
granted ([notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)).
A Device Owner **can** silently grant it via `setPermissionGrantState`.
**Implementation note:** the module's DO grant helper (`grantLocationSimPermissionsIfOwner`)
currently grants location + phone only, **not** `POST_NOTIFICATIONS`. On Android 13+ reminders will
be silently suppressed unless the app either requests it at runtime or the DO adds it to the grant
list. Add `POST_NOTIFICATIONS` to the DO grant pass.

### RECEIVE_BOOT_COMPLETED — normal
Delivers `BOOT_COMPLETED` so the reminder plan reschedules and the EMI lock re-asserts after reboot.
Required; correctly declared. `TIMEZONE_CHANGED` / `TIME_SET` / `MY_PACKAGE_REPLACED` need **no**
extra permission. Ref: [Manifest.permission#RECEIVE_BOOT_COMPLETED](https://developer.android.com/reference/android/Manifest.permission#RECEIVE_BOOT_COMPLETED).

### RECEIVE_SMS — dangerous (biggest Play caveat)
Backs the offline SMS LOCK/UNLOCK channel (sender allowlist + customer code only —
**not** cryptographically authenticated; sender IDs are spoofable). DO **can** grant it silently
(code confirms: `setPermissionGrantState(..., RECEIVE_SMS, GRANTED)`).
**Google Play SMS/Call-Log policy** restricts `RECEIVE_SMS`: on the public Play Store it is allowed
only for a default SMS handler or a short list of approved use cases — **device financing is not one
of them** ([SMS/Call Log policy](https://support.google.com/googleplay/android-developer/answer/10208820)).
The compliant path is **private / managed distribution**: apps privately published under
[Managed Google Play](https://support.google.com/googleplay/android-developer/answer/10467955) (or
sideloaded during DO provisioning) are outside the public-listing SMS review. The receiver is
hardened at the OS level (`android:permission="android.permission.BROADCAST_SMS"`), and the
channel is gated by the sender allowlist plus the customer code. It is **not** HMAC-signed —
replay/spoof protection against a determined attacker is not provided; treat SMS as a degraded
offline fallback, not an authenticated channel.

### ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION — dangerous
Foreground location for on-demand fetch. DO grants both silently (code confirms). Required and
correctly declared. See [§6](#6-background-location--foreground-service-the-key-decision) for the
background case. Ref: [Location permissions](https://developer.android.com/training/location/permissions).

### READ_PHONE_STATE / READ_PHONE_NUMBERS — dangerous
`SubscriptionManager.getActiveSubscriptionInfoList()` needs `READ_PHONE_STATE`; reading the MSISDN
(`SubscriptionInfo.getNumber()`) needs `READ_PHONE_NUMBERS`. DO grants both silently (code confirms).
Required and correctly declared. Both are sensitive on public Play and must be justified in the Data
safety form; not in the restricted SMS/Call-Log group.
Ref: [Manifest.permission#READ_PHONE_NUMBERS](https://developer.android.com/reference/android/Manifest.permission#READ_PHONE_NUMBERS).

### CHANGE_WIFI_STATE / ACCESS_WIFI_STATE — normal
`WifiManager.setWifiEnabled()` is gated by `CHANGE_WIFI_STATE`. It is **deprecated for ordinary apps
since Android 10 (Q) and returns `false`**, but **continues to work for a Device Owner / system app**
— which is exactly this use case
([setWifiEnabled](https://developer.android.com/reference/android/net/wifi/WifiManager#setWifiEnabled(boolean))).
Both are `normal` (no runtime grant needed). Correctly declared.

### WAKE_LOCK / VIBRATE — normal
`WAKE_LOCK` keeps the CPU awake long enough for the alarm receiver to post the notification and speak
the TTS line; `VIBRATE` is for notification haptics. Both `normal`, low-risk, correctly declared.

### REQUEST_IGNORE_BATTERY_OPTIMIZATIONS — normal (Play-restricted)
Lets the app prompt the user for an exemption from Doze/App-Standby so alarm delivery and SMS
command handling survive when the app is closed. Google Play restricts the
`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` flow to a specific
[acceptable-use list](https://developer.android.com/training/monitoring-device-state/doze-standby#whitelisting-cases);
generic "keep my app alive" is disallowed on the public Store.
**DO-native alternative (preferred on managed devices):**
[`setUserControlDisabledPackages()`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setUserControlDisabledPackages(android.content.ComponentName,%20java.util.List%3Cjava.lang.String%3E))
(API 30) stops the user/system from force-stopping or restricting the app without needing this
permission or a user prompt. Keep the permission only for private distribution, or migrate to
`setUserControlDisabledPackages`.

### TextToSpeech — no permission
The `android.speech.tts.TextToSpeech` API needs **no** manifest permission. Correctly none.
(Only if you *enumerate* TTS engines on Android 11+ would you add a `<queries>` for
`INTENT_ACTION_TTS_SERVICE`; using the default engine needs nothing.)
Ref: [TextToSpeech](https://developer.android.com/reference/android/speech/tts/TextToSpeech).

### QUERY_ALL_PACKAGES — do NOT add
`hideAllUserApps` enumerates apps via `PackageManager.getInstalledApplications`. On Android 11+ this
is subject to [package-visibility filtering](https://developer.android.com/training/package-visibility),
and the broad `QUERY_ALL_PACKAGES` is a
[Play-restricted permission](https://support.google.com/googleplay/android-developer/answer/10158779).
A **Device/Profile Owner is granted full package visibility by the platform**, so the enumeration
works without `QUERY_ALL_PACKAGES` (this is the assumption the code relies on and it is correct for a
DO). Do not add it — it would trigger Play review for no benefit and only matters if the app is ever
run as a non-owner.

---

## 4. Google Play policy summary (public listing vs private distribution)

| Permission | Public Play Store | Private / Managed Google Play or DO-sideloaded |
|---|---|---|
| `RECEIVE_SMS` | Blocked for this use case (default-SMS/approved only) | **OK** — outside public SMS review |
| `ACCESS_BACKGROUND_LOCATION` | Declaration form + demo video + prominent disclosure + privacy policy; heavy review | Policy still nominally applies but not user-facing-reviewed; **feasible** |
| `USE_EXACT_ALARM` | Alarm-clock/calendar apps only → likely rejected | OK |
| `SCHEDULE_EXACT_ALARM` | Broad legitimate uses allowed | OK |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Acceptable-use list only | OK (or use `setUserControlDisabledPackages`) |
| `QUERY_ALL_PACKAGES` | Restricted; not needed here | Not needed (DO exempt) |

**Bottom line:** TelePoint's SMS-command + background-tracking + exact-alarm profile is only
cleanly compliant under **private / managed distribution**, which matches a financed-device model.
Refs: [background-location policy](https://support.google.com/googleplay/android-developer/answer/9799150),
[SMS/Call-Log policy](https://support.google.com/googleplay/android-developer/answer/10208820),
[permission declaration / Managed Google Play exception](https://support.google.com/googleplay/android-developer/answer/10467955).

---

## 5. INTERNET & network state
`INTERNET` and `ACCESS_NETWORK_STATE` are **`normal`** and are auto-merged into the release manifest
by React Native / Expo (RN core + Expo add `INTERNET`; several libs add `ACCESS_NETWORK_STATE`).
They are not in the explicit `app.json` list. **Action:** verify both appear in the merged
`AndroidManifest.xml` (`expo prebuild` output / APK). If reachability checks or NetInfo are used,
declare `ACCESS_NETWORK_STATE` explicitly to be safe. `INTERNET` is effectively required
(Supabase sync, photo download). No storage permission is needed because the photo is cached in
app-internal storage.

---

## 6. Background location + foreground service (the key decision)

**Current implementation** (`getLocation`): reads `LocationManager.getLastKnownLocation()` across
GPS/NETWORK/PASSIVE providers, on demand, checking only `ACCESS_FINE/COARSE_LOCATION`. There is **no
`requestLocationUpdates`, no foreground service, and no `ACCESS_BACKGROUND_LOCATION`**.

**The rule:** on **Android 10 (API 29)+**, any location read that happens when the app has **no
visible activity and no running foreground service** is *background* access and requires
**`ACCESS_BACKGROUND_LOCATION`** — this includes `getLastKnownLocation()`
([background location](https://developer.android.com/develop/sensors-and-location/location/background),
[location permissions](https://developer.android.com/training/location/permissions)).

So it depends on **when the "sync-cadence" fetch runs**:

- **If location is only fetched while a TelePoint activity is on screen** → foreground only →
  `ACCESS_BACKGROUND_LOCATION` is **not** needed (current declarations are sufficient).
- **If location is fetched at sync cadence with the app closed/backgrounded** (the stated
  "report at sync cadence … may run while app backgrounded" model, e.g. from an alarm-driven
  receiver or background task) → **`ACCESS_BACKGROUND_LOCATION` is REQUIRED and is currently
  MISSING.**

**How a Device Owner grants background location:**
1. Declare `<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>`.
2. DO calls `setPermissionGrantState(admin, pkg, ACCESS_BACKGROUND_LOCATION, PERMISSION_GRANT_STATE_GRANTED)`
   — it is a runtime permission, so the DO can grant it **silently**, bypassing the user-facing flow.
3. Grant **foreground** location (`ACCESS_FINE`/`COARSE`) **first/together**; background location's
   accuracy follows the foreground grant. On **Android 11 (API 30)** the *user-facing* flow forbids
   requesting foreground + background in one dialog and sends background to Settings
   ([Android 11 location](https://developer.android.com/about/versions/11/privacy/location)); the DO
   `setPermissionGrantState` path is not subject to that dialog. On **Android 10** background was
   implied by foreground pre-11, but declaring + granting explicitly is still correct on 10+.
   Add `ACCESS_BACKGROUND_LOCATION` to `grantLocationSimPermissionsIfOwner`.

**Foreground service — needed?**
- **Reminders: NO.** `AlarmManager.setExactAndAllowWhileIdle` + `RECEIVE_BOOT_COMPLETED` reschedule
  is the documented, correct pattern and needs **no** foreground service. A `goAsync()` broadcast
  receiver (short work) is fine for posting notifications.
- **Tracking: only if you choose a persistent/periodic service.** For "report last-known at sync
  cadence," an exact alarm firing a receiver that reads last-known location (with
  `ACCESS_BACKGROUND_LOCATION`) **suffices — no FGS required.** If you later switch to continuous
  updates or need reliability beyond a background last-known read, wrap it in a foreground service;
  then, on **Android 14 (API 34)**, you must add `FOREGROUND_SERVICE` **and**
  `FOREGROUND_SERVICE_LOCATION` (or `FOREGROUND_SERVICE_DATA_SYNC`) and declare the type on the
  service ([FGS types](https://developer.android.com/about/versions/14/changes/fgs-types-required)).
  These are **not needed by the current design.**

---

## 7. Customer vs Retailer app

- **Customer app** (`com.telepoint.customer`) — owns **every** permission in this document.
- **Retailer app** (`TELEPOINT_APP_VARIANT=retailer`, WebView portal) — needs essentially only
  `INTERNET` (+ `ACCESS_NETWORK_STATE`, and `POST_NOTIFICATIONS` **only** if it shows local
  notifications). It must **not** declare device-admin, SMS, location, phone, Wi-Fi, exact-alarm,
  boot, or battery-optimization permissions. Keep the sensitive manifest entries out of the retailer
  build variant.

---

## 8. Answers to the four review questions

**(1) Unnecessary / risky in the current list**
- `USE_EXACT_ALARM` — **redundant** alongside `SCHEDULE_EXACT_ALARM` and a **public-Play rejection
  risk** (alarm/calendar apps only). Keep only `SCHEDULE_EXACT_ALARM` unless privately distributed.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — Play acceptable-use-restricted; prefer the DO-native
  `setUserControlDisabledPackages`. Keep only for private distribution.
- `RECEIVE_SMS` — not unnecessary (core feature) but the **single biggest policy constraint**:
  forces private/managed distribution.
- No permission is outright dead/removable except one of the two exact-alarm perms.

**(2) Required but MISSING**
- **`ACCESS_BACKGROUND_LOCATION`** — required *iff* location is read while backgrounded (the stated
  sync-cadence model). Top gap.
- **`INTERNET` / `ACCESS_NETWORK_STATE`** — required for a networked app; not in the explicit list —
  verify they are merged from RN/Expo, else declare them.
- **`FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`** — *conditionally* required, only if
  tracking is reimplemented as a foreground service on Android 14+. Not required by the current
  AlarmManager design.
- Implementation (not manifest) gap: add `POST_NOTIFICATIONS` (and, if backgrounded,
  `ACCESS_BACKGROUND_LOCATION`) to the DO `setPermissionGrantState` grant pass.

**(3) Foreground service needed for reliable reminders/tracking?**
No for reminders — exact alarms (`setExactAndAllowWhileIdle`) + boot reschedule are the correct,
sufficient pattern. For tracking, exact alarm + background last-known read suffices; a foreground
service (with FGS_LOCATION type on 14+) is warranted only if you move to continuous/periodic tracking
with the app closed.

**(4) Is `ACCESS_BACKGROUND_LOCATION` needed, and how does a DO grant it?**
Needed only if the location read runs with no visible activity / no FGS (Android 10+) — which the
"sync cadence while backgrounded" model implies. Grant it by (a) declaring it in the manifest and
(b) `setPermissionGrantState(admin, pkg, ACCESS_BACKGROUND_LOCATION, GRANTED)` after/with the
foreground grant; the DO path is silent and bypasses the Android 11 two-step Settings dialog.
`setPermissionGrantState` works for this because it is a runtime permission (it would **not** work
for the appop `SCHEDULE_EXACT_ALARM`).
