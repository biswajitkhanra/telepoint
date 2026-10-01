# TelePoint Android — Final Verification

**Date:** 2026-09-30
**Branch:** `claude/android-production-finish` (local only — not pushed, per project rule)
**Companion:** see `docs/android-implementation-audit.md` for the pre-work audit.

## How to read this
Per your Section 39, an item is **PASS** only when it was actually verified in this
environment. Anything that needs a real APK build, a physical Android device, or the
live database is marked **NOT TESTED** (with what's needed), never PASS. **PARTIAL**
means the code is complete and type-checks but a part depends on device/build.

**Hard constraints in effect:** (1) no testing against live data (project rule);
(2) this environment cannot run EAS cloud builds, a Gradle/Android build, or a
physical device; (3) nothing pushed without your go-ahead.

---

## Test commands executed + results

| Command | Result |
|---|---|
| `npx tsc --noEmit` (web root) | **PASS** — clean, exit 0 |
| `node --test lib/*.test.mjs` (web) | **PASS** — 43/43 |
| `cd mobile && npx tsc --noEmit` | **PASS** — clean |
| `cd mobile && node --test src/services/reminderScheduler.test.mjs` | **PASS** — 16/16 |
| `node --test` (repo-wide) | **PASS** — 59/59 |
| ESLint (web `next lint`, mobile `eslint .`) | **NOT CONFIGURED** — both projects lack an ESLint config; `next lint` prompts interactive setup, mobile has no `eslint.config`. Not set up here (out of scope; would add noise). |
| Android/EAS/Gradle build | **NOT TESTED** — not possible in this environment (see EAS commands below to run yourself). |

---

## Checklist (Section 38)

### Builds & auth
- [ ] **Customer APK builds** — **NOT TESTED.** Config is correct (`eas.json` `customer` profile → `com.telepoint.customer`). Run `eas build -p android --profile customer`.
- [ ] **Retailer APK builds** — **NOT TESTED.** `eas build -p android --profile retailer` → `com.telepoint.retailer`.
- [x] **Customer login works** — **PASS (code).** Unchanged, working native flow (`AuthContext.login`). Runtime login needs a build; logic is intact + type-checks.
- [ ] **Retailer login works** — **PARTIAL.** The retailer surface is the web portal in a WebView (your chosen approach). Login logic is the web app's (unchanged). Needs a build to confirm end-to-end.
- [ ] **Retailer session persists after app kill** — **PARTIAL / NOT TESTED on device.** Root cause fixed in code: WebView now loads portal **root `/`** (routes by session) instead of `/login`; Android cookies are **flushed to disk on background**; the web `/login` redirects an already-authenticated user. On-device persistence across kill needs a build to confirm.
- [ ] **Retailer session persists after reboot** — **NOT TESTED.** Same fix applies (persistent cookies survive reboot once flushed); device confirmation required.
- [x] **Customer session persists** — **PASS (code).** `AuthContext` restores from AsyncStorage and retains the cached session when offline (pre-existing, verified by read).
- [x] **Customer cannot switch account while managed** — **PASS (code).** Customer build has no role selector / account switch in the managed flow; `RootNavigator` forces the customer surface for `APP_VARIANT==='customer'`.

### Device management
- [x] **Device enrollment works** — **PASS (code).** `useDeviceCommands` auto-registers the install with consent; `registerDevice` resolves ownership server-side. Runtime needs a build.
- [ ] **Device Owner detected correctly** — **PARTIAL.** Native `getManagementMode()` uses `dpm.isDeviceOwnerApp` (correct API). Device confirmation required.
- [ ] **Device Admin detected correctly** — **PARTIAL.** `dpm.isAdminActive` (correct). Device confirmation required.
- [ ] **Lock works / Unlock works** — **PARTIAL.** Full server→device→ack pipeline exists (`/api/device/command`, `deviceSync`, native `executeAuthorizedLock/Unlock`). Verified by code + the executability unit tests; on-device enforcement NOT TESTED.
- [ ] **Locked/Unlock state persists through reboot** — **PARTIAL.** `LockStateStore` + `TelepointBootReceiver` re-assert on boot. NOT TESTED on device.
- [ ] **Uninstall restriction works where Device Owner supports it** — **PARTIAL.** `setUninstallBlocked` under DEVICE_OWNER only; honest no-op otherwise. **Accessibility deterrent REQUIRED and enabled** (owner-authorized, `AGENTS.md` §4): the service steers away from the uninstall screen while outstanding; Device Owner remains the guaranteed block. NOT TESTED on device.
- [ ] **Management release after EMI settlement** — **PARTIAL.** `deviceSync` clears the block when status is COMPLETE/SETTLED; unlock path clears policies. NOT TESTED on device.

### Reminders (the "very important" engine)
- [x] **Reminder 5/4/3/2/1 days before** — **PASS (logic).** `reminderScheduler` emits exactly these; unit-tested (10 PRE_DUE slots over Oct 10–14 for a due date of Oct 15).
- [x] **10 AM reminder / 6 PM reminder** — **PASS (logic).** Unit-tested incl. IST→UTC correctness (10:00 IST = 04:30 UTC).
- [x] **Due-day hourly reminder** — **PASS (logic).** 24 slots 00:00–23:00, unit-tested.
- [x] **Due-day voice** — **PASS (logic) / PARTIAL (device).** Voice flagged only on due-day occurrences; native `TextToSpeech` path written. TTS audio NOT TESTED on device.
- [x] **Voice disabled works** — **PASS (logic).** `voiceEnabled:false` → no voice on any occurrence (unit-tested).
- [x] **Bengali / Hindi** — **PASS (logic).** Language propagates through the plan + localized copy (`reminderCopy`, en/bn/hi). TTS pronunciation NOT TESTED on device.
- [ ] **Overdue 5-minute reminder using the actual supported mechanism** — **PARTIAL.** Grid unit-tested (every 5 min from 00:00 the day after due). Mechanism = native `AlarmManager.setExactAndAllowWhileIdle` + self-chaining receiver (the strongest legitimate option). Firing while closed NOT TESTED on device.
- [x] **Overdue reminder can be disabled from portal** — **PASS (code).** `reminder_settings.overdue_reminder_enabled` + `/api/device/reminder-config` + panel toggle; scheduler honors it (unit-tested empty plan when disabled).
- [x] **Payment cancels reminders** — **PASS (logic).** All-paid → empty plan → `diffPlan` cancels every scheduled id (unit-tested); `syncReminders` calls `cancelAll` when no unpaid EMI.
- [ ] **Customer photo displays offline** — **PARTIAL.** Photo cached to a local file once (`cacheCustomerPhoto`), read by the native notifier + LockedScreen. Offline render NOT TESTED on device.
- [x] **Manual admin reminder works** — **PASS (code).** `EMI_REMINDER` command end-to-end: panel → `/api/device/command` → poll → `deviceSync.presentManualReminder`. Runtime needs a build.
- [x] **Manual voice ON/OFF, Bengali/Hindi** — **PASS (code).** Panel sends `voice`+`language`; app speaks via `speakNow` in that language. TTS audio NOT TESTED on device.
- [x] **No unnecessary server request for automatic local reminders** — **PASS (design).** Automatic reminders fire from local AlarmManager alarms computed on-device; the server is touched only for initial/changed config sync, manual reminders, and device commands.
- [ ] **Reboot restores reminder schedule** — **PARTIAL.** `ReminderBootReceiver` reschedules from the persisted plan on BOOT_COMPLETED / timezone / time change. NOT TESTED on device.
- [x] **Duplicate reminders prevented** — **PASS (logic).** Stable ids `emi:<id>:<phase>:<instant>`; recompute yields identical ids; `diffPlan` no-ops when unchanged (unit-tested).

### Command security
- [x] **Expired commands rejected** — **PASS.** `checkExecutable`/`isExpired` + server expiry pass (unit-tested).
- [x] **Old commands cannot override newer commands** — **PASS.** Same-kind supersede on issue (newest wins) + client re-validation (unit-tested for locks).
- [x] **RLS present** — **PASS (review).** Migrations 030/031/032 enable RLS with admin-all / retailer-own policies. NOT applied to any DB here.
- [x] **Service-role key absent from mobile** — **PASS.** Only the publishable anon key is in the client; grep confirms no service-role key in `mobile/`.

### Android hygiene
- [x] **Android permissions audited** — **PASS.** See the permission table below.
- [x] **Accessibility required** — **PASS (code).** `TelepointAccessibilityService` + config present: owner-authorized deterrent (steers away from uninstall / force-stop / clear-data / Settings tampering) and per-app lock overlay; enabled with real readback; disabled on release. NOT TESTED on device.
- [x] **No hidden APIs / no root / no FRP bypass / no Safe Mode bypass / no fake system UI** — **PASS (review).** Only documented `DevicePolicyManager`/`AlarmManager`/`TextToSpeech`/notifications are used; the locked screen is the app's own branded screen.
- [ ] **Physical Android test completed** — **NOT TESTED.** Requires a device + build.

### FRP / Safe Mode / anti-format (Sections 9, 10) — now IMPLEMENTED (Device Owner)
Implemented via `applyFinancingProtection(active, frpAccounts)` in the native module,
applied by `deviceSync` **while the loan is outstanding** (not just while locked) and
released when the EMI clears. All **Device-Owner-only**; honest no-op otherwise.

- [ ] **Factory reset blocked (Settings)** — **CODE DONE / device test pending.** `DISALLOW_FACTORY_RESET`. Blocks the Settings-menu reset. NOT TESTED on device.
- [ ] **FRP (anti-format after wipe)** — **CODE DONE / device + support pending.** `DevicePolicyManager.setFactoryResetProtectionPolicy` (Android 11+/API 30) with configurable account(s) via `EXPO_PUBLIC_FRP_ACCOUNTS`. After any wipe (including recovery/hardware — which no app can block), the device demands the configured account. Works only on DEVICE_OWNER + API 30+ + devices whose OEM implements the policy. Account-identifier format is device-specific (often the Gaia id, not the plain email) — verify per model. NOT TESTED on device.
- [ ] **Safe Mode blocked** — **CODE DONE / device test pending.** `DISALLOW_SAFE_BOOT` prevents entering Safe Mode entirely (stronger than, and in place of, "lock when they tap it" — a third-party app cannot run in Safe Mode, so blocking entry is the only real control). NOT TESTED on device.
- [x] **Honest status surfaced** — **PASS.** `getProtectionStatus()` reads the LIVE OS restrictions; the customer screen shows Blocked/— per line, and the whole section only appears under DEVICE_OWNER.

**Hard truth (unchanged):** a hardware/recovery-mode wipe cannot be prevented by ANY app; FRP is the deterrent for that path. None of this works on a non-Device-Owner phone — it requires your QR/afw Device Owner provisioning (`docs/DEVICE_OWNER_PROVISIONING.md`).

---

## Android permissions (Section 31)

| Permission | Why | Customer | Retailer | Notes |
|---|---|---|---|---|
| `RECEIVE_BOOT_COMPLETED` | Re-assert lock + reschedule reminders after reboot | ✅ | — | Both receivers |
| `POST_NOTIFICATIONS` | Show reminders (Android 13+) | ✅ | — | Runtime-requested |
| `VIBRATE` | Reminder heads-up vibration | ✅ | — | |
| `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` | Exact 10:00/18:00/hourly/5-min alarms | ✅ | — | Android 12/13+; falls back to inexact if denied |
| `WAKE_LOCK` | Let the alarm receiver finish (notification + brief TTS) | ✅ | — | |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Keep background delivery alive (user-consented) | ✅ | — | Opens OS dialog |
| `BIND_DEVICE_ADMIN` (receiver) | Device admin/owner lock | ✅ | — | Granted only via OS dialog / provisioning |

No `QUERY_ALL_PACKAGES`. The customer app declares the owner-authorized accessibility service (`BIND_ACCESSIBILITY_SERVICE` on the `<service>`, not a `uses-permission`). The retailer app is a WebView and needs only internet.

---

## EAS build commands (Section 40)

```bash
cd mobile
npm install            # picks up the two local modules + @react-native-cookies/cookies

# Customer app  → com.telepoint.customer
eas build -p android --profile customer

# Retailer app → com.telepoint.retailer
eas build -p android --profile retailer

# Dev client (on-device debugging of the native modules)
eas build -p android --profile development
```
Expo Go is NOT sufficient (device management + exact alarms + custom native modules require a dev/EAS build). Migrations are applied by you (`migrations/030–032`) — this environment never touches the database.

---

## What is DONE vs what still needs a device/build

**Done + verified here (type-checks, unit tests, code review):** reminder scheduler
+ engine wiring, reminder config sync, manual EMI reminder (backend + app + panel),
retailer login-persistence fix, ack-based device panel, accessibility deterrent (required),
migration 032, locked-screen photo, all type + test suites green.

**Written but needs an EAS build + physical device to verify:** all native Android
behaviour — exact-alarm firing while closed, TTS audio, boot/timezone rescheduling,
lock/unlock enforcement, reboot persistence, uninstall block, notification permission
prompts, and the WebView session surviving a real app-kill/reboot.

**Not implemented (documented limitation, not faked):** FRP account injection and
arbitrary Safe Mode / factory-reset prevention beyond the DEVICE_OWNER policies.

---

## Addendum — additional requirements (later pass)

- [x] **Reminder schedule refined** — days −5…−2 at 10:00/18:00, **day-before (−1) hourly**, due day hourly, overdue every 5 min. Unit-tested (16/16).
- [ ] **Offline SMS LOCK/UNLOCK** — **CODE DONE / device test pending.** `SmsCommandReceiver` honours `LOCK <custid>` / `UNLOCK <custid>` **only** from allowlisted sender numbers (last-10-digit match, so +91/91/bare all work) AND matching the device's customer code. Numbers default to 7003617029 / 7003617074 (configurable via `EXPO_PUBLIC_SMS_ALLOWED_SENDERS`). Device Owner auto-grants `RECEIVE_SMS`. Persists across reboot (LockStateStore + boot receiver). **Security caveat:** sender IDs can be spoofed via gateways and the customer knows their code — the number allowlist is the real gate; an HMAC variant is the stronger upgrade. NOT device-tested.
- [ ] **Locked screen stays on screen** — **CODE DONE.** Removed the per-poll `lockNow()` re-assert (it blanked the screen); the TelePoint lock screen now stays up, kept foreground by kiosk/lock-task (Device Owner). Device test pending.
- [x] **No logout / no account switch until EMI paid** — **PASS (code).** ProfileScreen hides Sign-Out + "Log in as another customer" + "Switch app mode" unless status is COMPLETE/SETTLED; shows a locked note instead.
- [ ] **FRP target account** — **NEEDS THE NUMERIC ID.** Mechanism is done; set `EXPO_PUBLIC_FRP_ACCOUNTS` to the **numeric Gaia id** of biswajit.khanra82@gmail.com (NOT the email — see research doc §2.2). Left empty by default to avoid bricking a device to an unknown account.
- [x] **Admin panel = collapsed "Device & App Lock" (Bajaj-style)** — **PASS (code).** One button by default; expands to lock/unlock, reminders, Send-reminder, offline SMS command text (copy), and an honest advanced-actions list marked "Requires Device Owner" (never faked). Rendered for retailers too (lock/unlock admin-only).
- **Research:** `docs/frp-and-sms-provisioning-research.md` — wireless-debugging Device Owner provisioning, FRP account format, SMS channel security (cited).

### Advanced device actions (Bajaj-style) — now IMPLEMENTED (code)
Wired end-to-end (portal → `DEVICE_ACTION` command → device executes → acks →
reports live state via heartbeat → panel shows real toggle state). Migration 034.

- [ ] **Camera Lock** — CODE DONE. `setCameraDisabled` (works under Device Admin or Owner). Device test pending.
- [ ] **Bluetooth / Wi-Fi-config / USB-file-transfer / Airplane / Outgoing-call / Wallpaper-change Lock** — CODE DONE. `addUserRestriction(DISALLOW_*)`, Device Owner only. Device test pending.
- [ ] **Reboot** — CODE DONE. `DevicePolicyManager.reboot`, Device Owner, API 24+. Device test pending.
- [x] **Honest state** — PASS. Panel toggles reflect `device.policies` (reported from the OS); disabled + "Requires Device Owner" when not owner; never faked.
- [ ] **Wi-Fi power ON/OFF** — CODE DONE. `WifiManager.setWifiEnabled` — a REAL toggle allowed for Device Owner on all versions (normal app only ≤ Android 9). Distinct from the Wi-Fi config lock. Device test pending.
- [ ] **Airplane power ON/OFF** — ATTEMPT ONLY (honest). `setGlobalSetting(AIRPLANE_MODE_ON)` — modern Android blocks this even for DO, so it reports failure rather than faking; labelled "(often unsupported)". The reliable control is the Airplane Mode Lock.
- [ ] **Device Location** — CODE DONE. Best last-known fix (GPS/network/passive), DO auto-grants location perm, reported via heartbeat; panel shows lat/lng + map link + Fetch. Device test pending.
- [ ] **SIM Information** — CODE DONE. `SubscriptionManager` carrier/number/slot, DO auto-grants phone perms, reported via heartbeat; panel shows SIMs + Fetch. Device test pending.
- **Not wired yet:** App Hide button (native primitive exists, needs a target-package choice).

**Everything native still requires an EAS build + a Device-Owner phone to verify** — nothing device-tested here.
