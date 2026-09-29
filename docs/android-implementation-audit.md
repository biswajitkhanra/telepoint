# TelePoint Android Implementation Audit

**Date:** 2026-09-30
**Scope:** `mobile/` (Expo/React Native apps + native `expo-telepoint-device-management` module) and the backend pieces the apps depend on (`app/api/device/*`, `lib/device*`, `middleware.ts`, `lib/supabase/*`, `migrations/030_device_management.sql`, `031_push_tokens.sql`).
**Method:** Static read of the actual source. No app was built and no device was tested for this pass (see *Verification honesty* at the end). Nothing has been modified yet.

---

## 0. Executive summary — the three things you asked about

1. **"Retailer login doesn't stay logged in."**
   The real cause is architectural, not a bug in the native staff-auth code. The **retailer/admin app is a WebView wrapper** (`WebPortalScreen.tsx`) that loads `https://telepoint-topaz.vercel.app/login`. Login happens on the web page inside the WebView, and the web portal stores its Supabase session in **cookies** (`@supabase/ssr`, see `lib/supabase/client.ts`). Android's `WebView`/`CookieManager` does **not reliably flush cookies to disk before the process dies**, so on app-kill/reboot the session cookie is lost and the retailer is back at the login page. The native `StaffLoginScreen` + `staffSession.ts` (which *do* implement real Supabase token auth in SecureStore) are **orphaned/dead code** — the retailer build never renders them.

2. **"EMI reminders don't reliably fire while the app is closed."**
   Correct, and it cannot work reliably as built. The reminder path is `expo-background-fetch` with `minimumInterval: 15 * 60` (`emiCheckTask.ts`). Android throttles background-fetch heavily and never guarantees a 15-minute cadence, let alone the exact **10:00 / 18:00**, **hourly on due day**, or **every-5-minutes overdue** schedule you specified. There is **no `AlarmManager`/exact-alarm native module** and **no local deterministic schedule** — the timing is entirely at the OS's discretion.

3. **"Two separate apps."**
   This part is largely in place. `TELEPOINT_APP_VARIANT` → `app.config.ts` produces `com.telepoint.customer` and `com.telepoint.retailer` with separate names/schemes, and `eas.json` has `customer`/`retailer`/`admin` profiles. The customer build correctly forces the customer surface and never shows a role selector; the retailer build forces the WebView. The gap is that the "retailer app experience" is a website in a WebView, not the native management UI your screenshot references.

---

## 1. Existing functionality (works, or is genuinely implemented)

### Customer app (native — real)
- **Customer login + persistent session.** `AuthContext.tsx` stores the customer session in AsyncStorage (`@telepoint_customer_session`) and restores it on launch, with a silent background refresh that *retains* the cached session when offline. This satisfies most of the "customer session persists" requirement (Section 4).
- **EMI dashboard, schedule, history, profile** screens exist and are wired through `MainTabs`.
- **Locked screen** (`LockedScreen.tsx`) takes over the whole customer surface when `useDeviceCommands` reports a CONFIRMED lock (Section 7 shell exists).
- **Device-command client** (`useDeviceCommands.ts` + `deviceSync.ts`) is well-built for LOCK/UNLOCK: it auto-registers the install, polls (60s, 12s while locked), validates each command locally (defence-in-depth), executes the native op, **acks the result**, and re-asserts the lock so a single manual unlock doesn't defeat it. Confirmed state comes from the server, not the button press.

### Native device-management module (`expo-telepoint-device-management`, Kotlin — honest and legitimate)
- Uses **only** `DevicePolicyManager` / `DeviceAdminReceiver` — no root, no hidden APIs.
- Correctly distinguishes `UNMANAGED / DEVICE_ADMIN / PROFILE_OWNER / DEVICE_OWNER` (`getManagementMode`, `getDeviceManagementStatus`) and reports `canEnforce` only for `DEVICE_OWNER`.
- `executeAuthorizedLock/Unlock` with **reboot persistence** via `LockStateStore` (SharedPreferences) + `TelepointBootReceiver` re-asserting on `BOOT_COMPLETED` (Section 8 core exists).
- DEVICE_OWNER lockdown: lock-task/kiosk, HOME-launcher takeover while locked, `setUninstallBlocked`, `DISALLOW_FACTORY_RESET/SAFE_BOOT/ADD_USER`. All correctly no-op'd (with honest reasons) when not Device Owner.
- Battery-optimisation exemption request (legitimate, user-consented).

### Backend command layer (mature, well-secured for LOCK/UNLOCK)
- `POST /api/device/command`: authenticates staff, **admin-only** for lock/unlock, resolves customer→retailer ownership **server-side**, refuses LOCK when loan is `COMPLETE/SETTLED`, **supersedes in-flight commands (newest wins)**, sets TTL/`expires_at`, writes an audit row, pushes a wake notification. This is a solid implementation of Sections 27/28 **for the two command types it supports**.
- `lib/deviceCommands.ts`: pure executability gate (`checkExecutable`) covering terminal/expired/customer-mismatch/device-mismatch/installation-mismatch, with unit tests (`lib/deviceCommands.test.mjs`).
- Migration `030_device_management.sql`: `devices` + `device_commands` tables, **RLS** (admin all / retailer read-own), a unique partial index enforcing one in-flight command per device, audit-insert policy hardened. `031_push_tokens.sql` for push.
- Web admin panel (`components/DeviceManagementPanel.tsx`) shows device status/mode/permission + command history and issues LOCK/UNLOCK. This is the panel the retailer WebView actually shows.

### Build/config
- `app.config.ts` variant system, `eas.json` profiles, no **service-role** key anywhere in the mobile tree (only the publishable anon key, which is safe under RLS). Section 26's "no service-role key in the client" is satisfied.

---

## 2. Broken / incorrect functionality

| # | Issue | Evidence | Spec section |
|---|-------|----------|--------------|
| B1 | **Retailer session doesn't survive app kill/reboot.** WebView cookie session isn't flushed to disk. | `WebPortalScreen.tsx` (WebView), `lib/supabase/client.ts` (cookie storage) | 3, 35 |
| B2 | **Native staff auth is dead code.** `StaffLoginScreen`/`staffSession.ts` implement real token auth but are never mounted; `RootNavigator` sends staff to `WebPortalScreen`. | `RootNavigator.tsx:150-154` | 3 |
| B3 | **`AuthContext.loginStaff()` ignores the password** and stores only a profile object — a no-op auth by itself. (Harmless only because the WebView path is used instead; dangerous if the native path is ever re-enabled without wiring `signInStaff`.) | `AuthContext.tsx:352-375` | 3, 26 |
| B4 | **Reminder engine uses background-fetch @15 min** — explicitly disallowed by your brief. No exact schedule, no AlarmManager. | `emiCheckTask.ts:97-113` | 11–15, 20 |
| B5 | **Reminder cadence is wrong.** In-app popup shows "once per open / 5×day"; background notif is "1/day upcoming, 5/day due". Neither matches 10:00+18:00, hourly-on-due-day, or every-5-min-overdue. | `EmiDueReminder.tsx`, `emiCheckTask.ts:43-79` | 12, 13, 14 |
| B6 | **Uninstall protection uses an AccessibilityService** — your brief forbids Accessibility for device management ("No Accessibility abuse"). | `TelepointAccessibilityService.kt`, manifest `<service>` block, `deviceSync.ts:55-56` | 5, 31, 37 |
| B7 | **Web panel flips UI to "Locked" on send, and falls back to a cosmetic `is_locked` DB flag when no device is registered** — i.e. it can show "Locked" with nothing enforced on a phone. Your brief: never show the green/locked state on command-created; only on device ack. | `DeviceManagementPanel.tsx:79-106` | 22, 29 |
| B8 | **No timezone-robust scheduling.** Reminder timing uses `new Date().toISOString().slice(0,10)` (UTC date) for the per-day cap; due math uses `diffDaysIST`. Mixed UTC/IST logic, no DST/tz-change handling. | `emiCheckTask.ts:54`, `utils/ist.ts` | 21 |
| B9 | **Anon key + Supabase URL are hard-coded** as fallbacks in `app.config.ts`, `eas.json`, `app.json`. Safe (publishable) but should come from env/secret; committing them is avoidable. | `app.config.ts:19-21`, `eas.json`, `app.json:52-53` | 26, 30 |

---

## 3. Missing functionality (specified but not present)

- **Native exact-alarm reminder engine** (AlarmManager + `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`, boot re-scheduling, foreground service for the overdue burst). *Nothing exists.* (Sections 11, 14, 20)
- **Deterministic local schedule with stable idempotent IDs**, PRE_DUE/DUE_DAY/OVERDUE states, cancel-on-paid, cancel-on-disable, reschedule-on-change. *Nothing exists.* (Section 20)
- **Voice / TTS** (Android `TextToSpeech`), due-day-only, Bengali/Hindi, per-customer language, cached config. *Nothing exists.* (Sections 13, 17, 18)
- **Customer photo** capture, local cache, offline display in reminders/locked screen. *No photo anywhere in the reminder/locked path.* (Section 16)
- **Full-screen-intent reminder** with photo/amount/date and Android 13+ `POST_NOTIFICATIONS` gating beyond the basic request. (Section 15)
- **Manual admin "Send EMI Reminder"** command (with/without voice, language) — no command type, no API, no UI. (Section 18)
- **~20 device actions** beyond LOCK/UNLOCK: App Lock, Wallpaper, Camera, USB, Bluetooth, Wi-Fi, Airplane, Tracking, SIM tracking, Outgoing-call lock, App hide, SIM-removal lock, Reboot, Location, SIM info, Copy Deep Link, Uninstall/release. *Neither the native module, the command enum (`LOCK|UNLOCK`), nor the panel support these.* Note: several of these are **DEVICE_OWNER-only or not possible at all** on stock Android (see §4). (Sections 5, 22)
- **Reminder/voice/language/overdue-toggle DB schema.** No columns/tables (`grep` for `voice|language|reminder_enabled|overdue_reminder` finds nothing in migrations). (Sections 17, 18, 19, 32)
- **Local encrypted data model** for offline reminders (customer id/name/photo path/emi/due/status/flags/tz/enrollment). *Not stored locally in this shape.* (Section 19)
- **Extended device-management statuses** (`MANAGEMENT_LOST`, `UNSUPPORTED`, `LOCK_REQUESTED`, etc.) — DB has a smaller set. (Section 29)
- **FRP** via supported Android Enterprise config, with documented version limits. Only referenced aspirationally in comments. (Section 10)
- **Automated auth/reminder test suites** the brief asks for (mobile side has *no* test runner or tests; web side has `node --test` with a few `lib/*.test.mjs`). (Sections 34, 35)

---

## 4. Android API limitations (honest constraints — these bound what is even possible)

- **Uninstall prevention, factory-reset block, kiosk, HOME takeover, FRP, disabling Safe Boot** are **DEVICE_OWNER-only**. On an ordinary `DEVICE_ADMIN` device none of these are possible, and Android provides *no* legitimate way to make an app un-removable or un-exitable. The existing module is correct to no-op them off-owner.
- **A truly un-exitable lock** requires DEVICE_OWNER + lock-task. `DEVICE_ADMIN.lockNow()` is only a screen lock the user opens with their own PIN. This is already modelled honestly.
- **Exact background execution** (every 5 min, forever, app closed) is not guaranteed by any Expo API. The strongest legitimate mechanism is native `AlarmManager.setExactAndAllowWhileIdle` + `USE_EXACT_ALARM` (Android 13+) / `SCHEDULE_EXACT_ALARM` (Android 12) and a **foreground service** for the overdue burst — and even these are subject to OEM battery killers (Xiaomi/Oppo/Vivo). We must document this, not promise perfection.
- **Camera/Bluetooth/Wi-Fi/USB/airplane/outgoing-call/app-hide/SIM controls:** most are **DEVICE_OWNER-only** (`setCameraDisabled`, `addUserRestriction(DISALLOW_*)`, `setApplicationHidden`, per-app suspension). **Airplane mode toggle** and **forcing Wi-Fi/mobile-data on/off programmatically** are **not available to third-party apps at all** on modern Android (no public API, even for Device Owner in most cases). **SIM removal detection** is possible (broadcasts); **preventing** SIM removal is not. **Reboot** is Device-Owner-only (`DevicePolicyManager.reboot`). These must be surfaced as "Unsupported / requires Device Owner" — never faked.
- **Android 13+ `POST_NOTIFICATIONS`** is a runtime permission; without it, none of the reminder UI shows. Must be requested and handled.
- **Full-screen intent** on Android 14+ requires the `USE_FULL_SCREEN_INTENT` permission and is restricted to calling/alarm-style apps; a lock/EMI reminder may be down-ranked to a heads-up notification. Must be handled gracefully.

---

## 5. Files that WILL be changed / added (proposed, pending your go-ahead on scope)

**Auth / session (retailer persistence — B1/B2/B3):**
- `mobile/src/screens/WebPortalScreen.tsx` (flush cookies; or replace with native), and/or re-wire `RootNavigator.tsx` + `StaffLoginScreen.tsx` + `staffSession.ts` if we go native.
- Possibly add a cookie-persistence native shim or `@react-native-cookies/cookies`.

**Reminder engine (B4/B5/B8 + Sections 11–21):**
- New native module `expo-telepoint-reminders` (Kotlin: AlarmManager, boot rescheduler, TTS, foreground service).
- New `mobile/src/services/reminderScheduler.ts` (pure, testable) + tests.
- Rewrite `emiCheckTask.ts`, `EmiDueReminder.tsx`; extend `notifications.ts` (channels, full-screen intent, photo).
- `mobile/app.json` permissions (`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE*`).

**Device actions + statuses (Sections 5, 22, 29):**
- Extend native module with the DEVICE_OWNER-supported actions only; report the rest as unsupported.
- Extend `command_type` enum + `POST /api/device/command` + `DeviceManagementPanel.tsx` (state = ack-confirmed only).
- Remove the AccessibilityService path (B6).

**DB (Sections 19, 32, 33):**
- New migration `032_*` (reminder config, voice/language, overdue toggle, manual-reminder command type, extended statuses, indexes, RLS, audit actions).

**Docs:** this file, plus `docs/android-final-verification.md`.

## 6. Files that should NOT be changed

- Everything under `app/` **except** the device API routes and the admin device panel — the web EMI/collections/reports/backups portal is live and out of scope.
- `migrations/001`–`031` (append new migrations only; never edit shipped ones).
- `lib/fineCalc.ts`, `lib/ist.ts`, `lib/analysis.ts`, `lib/paymentReconcile.ts` and other financial logic (not part of this brief; changing them risks live money math).
- `supabase/*` restore/upgrade scripts (operational, not app code).
- Customer financial screens (`DashboardScreen`, `EmiScheduleScreen`, `PaymentHistoryScreen`) beyond wiring in the reminder/photo data they already receive.

---

## 7. Verification honesty (per your Section 39)

Given the constraints on this project — **(a)** a memory-recorded rule that there is to be **no testing against the live Supabase/data** (security/UI tests only on a separate test project), **(b)** no ability to run an EAS cloud build, a Gradle Android build, or a physical device from this environment, and **(c)** the no-push-without-go-ahead rule — the following classes of requirement are **NOT TESTABLE here** and will be marked as such in `android-final-verification.md`, never as PASS:

- Any APK build (customer/retailer), EAS commands, native Gradle compile.
- Any on-device behaviour: lock/unlock enforcement, reboot restoration, Device Owner/Admin detection, uninstall block, FRP, Safe Boot, background alarm firing, TTS output, full-screen intent, notification permission prompts.
- Anything requiring the live database or a physical enrolled device.

What **is** verifiable here and will be tested: pure TypeScript logic (the reminder scheduler, executability gates, timezone math) via `node --test`, `tsc --noEmit`, lint, SQL migration review, and code-level correctness of the auth wiring.

---

## 8. Recommended sequencing (highest value, lowest risk, verifiable first)

1. **Reminder scheduler as a pure module + unit tests** (5-day/10:00/18:00, due-day hourly, overdue 5-min, paid-cancel, tz edges, idempotent IDs). Fully testable now.
2. **DB migration** for reminder config + manual-reminder command + extended statuses (review + `tsc`).
3. **Retailer session persistence fix** (decide native-vs-WebView first — see open question).
4. **Native reminder module** (AlarmManager + TTS + foreground service) — writable now, device-test later.
5. **Device-action expansion + panel ack-state fix + remove Accessibility.**
6. `android-final-verification.md` with PASS / FAIL / PARTIAL / NOT TESTABLE per item.

**One decision blocks #3 and shapes #5:** whether the retailer/admin app stays a WebView (fix = flush/persist cookies + build the device-actions panel *in the web portal*) or becomes a **native** retailer app (fix = re-wire the orphaned native staff screens + build the native "Action Details" panel your screenshot shows). These are very different amounts of work and I should not pick for you.
