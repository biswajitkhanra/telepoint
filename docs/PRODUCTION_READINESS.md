# TelePoint — Production Readiness (strict)

Scope: Android customer app (`mobile/`, package `com.telepoint.customer`) and the
web portal surface it depends on. Read together with `checksum.md` (ledger) and
`docs/ANDROID_MASTER_CHECKLIST.md` (full checklist). Updated 2026-10-01.

**Rule for every box below: unchecked / "NOT RUN" = NOT done. Do not mark a box
without recorded evidence (build log, device model + Android version + build ID +
actual result). A queued EAS build is not a pass; a `tsc` pass is not a Kotlin
compile; source review is not a device test.**

---

## 0. Blocking facts (cannot be skipped or faked)

1. **Only Device Owner can guarantee** blocking uninstall and Settings factory
   reset: `setUninstallBlocked` + `DISALLOW_FACTORY_RESET` + `DISALLOW_SAFE_BOOT`
   + `DISALLOW_ADD_USER` + FRP. A normal APK install or Device Admin does not.
2. The TelePoint AccessibilityService is **customer-consented, on-device only** —
   enabled by the owner/store with the real system toggle at provisioning. It is a
   deterrent (off in Safe Mode); it is **not** a replacement for Device Owner and
   must never be claimed to block a bootloader/recovery wipe.
3. Nothing is production-ready until: Kotlin compiles (EAS/Gradle), both APKs are
   built and FINISHED, and the Device-Owner acceptance matrix (§4) is executed on
   a real phone.

---

## 1. Build gate — run in order, all must pass

- [ ] `mobile: npx tsc --noEmit` (exit 0)
- [ ] `web: npx tsc --noEmit` (exit 0)
- [ ] `mobile: node --test src/services/reminderScheduler.test.mjs src/services/deviceSync.test.mjs` (24/24)
- [ ] `mobile: npx expo export --platform android` (JS bundle, exit 0)
- [ ] Kotlin compile: `cd mobile; npx expo prebuild --clean` then Gradle `assembleDebug`, **or** an EAS build. Capture the log. Confirm the merged manifest includes:
  - `TelepointAccessibilityService` + `BIND_ACCESSIBILITY_SERVICE`
  - `TelepointCommandService` (foreground, dataSync)
  - `TelepointDeviceAdminReceiver`, `TelepointBootReceiver`, `SmsCommandReceiver`, `SimSentinelReceiver`
  - `SYSTEM_ALERT_WINDOW`, `RECEIVE_SMS`, `USE_FULL_SCREEN_INTENT`, exact-alarm permissions
- [ ] EAS customer build (`com.telepoint.customer`) **FINISHED** — record artifact URL + APK SHA-256.
- [ ] EAS retailer build (`com.telepoint.retailer`) **FINISHED** — record URL + SHA-256.
- [ ] Physical Device-Owner phone acceptance (§4) actually performed.

---

## 2. Security gate

- [ ] GitHub repo is **private**.
- [ ] No service-role key in the app/portal client (only the publishable anon key, safe under RLS).
- [ ] Scrub committed secrets to env-only (EAS secrets / Vercel env), and remove the
      hardcoded fallbacks in `mobile/src/config.ts` and `mobile/app.json`:
  - `FRP_PROTECTION_ACCOUNTS` (numeric Gaia id — must NOT be a plain email)
  - `SMS_ALLOWED_SENDERS` (the offline command gate)
  - `portalUrl` / `supabaseUrl` / `supabaseAnonKey` (publishable but should come from env)
- [ ] FRP account is a **numeric Gaia id** (People API `people/me` → `metadata.sources[].id`), not the email.
- [ ] Migrations `030, 031, 032, 034, 035, 036` applied (there is no 033) with RLS active on all new tables.
- [ ] Document the offline SMS channel as **sender-allowlist + customer code, not cryptographically authenticated**. Do not describe it as signed. (HMAC-signed SMS is an optional future upgrade.)
- [ ] Signing keys match the QR provisioning checksum (customer/retailer packages + SHA-256).

---

## 3. Provisioning gate (per financed phone)

- [ ] Recorded agreement/consent for device management.
- [ ] Fresh/reset phone enrolled as **Device Owner** (QR at setup, or ADB) — see `docs/DEVICE_OWNER_PROVISIONING.md`.
- [ ] Accessibility deterrent enabled **in front of the customer** via Settings → Accessibility (TelePoint device protection); PIN-9088 confirms "on".
- [ ] Grant (on device): Display-over-other-apps, unrestricted battery, exact alarms, notifications, SMS, location/phone (Device Owner auto-grants runtime perms).
- [ ] SIM sentinel baselined (`setSimBaseline`) after enrollment.

---

## 4. Device acceptance matrix (record model / Android / build id / actual result per row)

- [ ] PIN-9088 shows: Device Owner on; uninstall blocked; factory-reset blocked; Safe-Mode blocked; add-user blocked; FRP supported (API 30+); USB-debugging blocked; force-stop/clear-data blocked; accessibility "on"; overlay "on".
- [ ] Uninstall from Settings and Play Store → blocked.
- [ ] Settings → System → Reset → blocked.
- [ ] Power menu → Safe Mode → not offered.
- [ ] Settings → Users → add user → blocked.
- [ ] Reboot → returns to lock; protection re-applied; accessibility state confirmed.
- [ ] **Full-screen overlay pop**: closed-app LOCK (online) and offline SMS `LOCK <code>` → red cover appears **immediately over the current app** (Display-over-other-apps).
- [ ] **Call lock**: while locked, outgoing calls blocked; emergency 112 still works; cover shown over an incoming-call screen; cleared on unlock.
- [ ] **Per-app PIN lock**: configure packages via portal → launching a guarded app shows the PIN overlay; correct PIN grants ~60 s; release clears it.
- [ ] Offline SMS `LOCK`/`UNLOCK`/`LOC`/`REBOOT`/feature commands from both authorized numbers in `+91 / 91 / bare` formats; wrong number and wrong customer code rejected (visible in PIN-9088 "Last SMS result").
- [ ] Remove SIM → sentinel locks + alerts; authorized SIM swap handled; reboot-without-SIM does not false-lock.
- [ ] TOTP offline unlock: correct code unlocks; clock-drift window honored; emergency/support path still works.
- [ ] Admin online UNLOCK → applied + acked; lock screen + overlay exit.
- [ ] Mark loan COMPLETE/SETTLED → all restrictions cleared, accessibility off, overlay dismissed, Device Owner removed, app uninstallable.
- [ ] Emergency call (112/108) and retailer contact still work while locked.

---

## 5. Release gate

- [ ] Release runs **before** processing any queued command; stale LOCK never re-executes for COMPLETE/SETTLED.
- [ ] Release clears: kiosk/lock-task, HOME takeover, camera, all `DISALLOW_*`, uninstall block, FRP (best-effort), suspended/hidden apps, tracking, SMS/SIM config, app-lock, accessibility, overlay, then `clearDeviceOwnerApp` with readback.
- [ ] Partial release retried; a failed FRP disable must not trap a paid customer.

---

## 6. Gap list — exactly what is NOT done / NOT verified today

| # | Item | State | Required to close |
|---|---|---|---|
| G1 | Kotlin compile | ❌ NOT RUN (no JDK/SDK here) | EAS/Gradle build with captured log |
| G2 | EAS customer + retailer builds | ❌ NOT RUN | FINISHED builds + SHA-256 |
| G3 | Device acceptance | ❌ NOT RUN | §4 on a real Device-Owner phone |
| G4 | Accessibility hard onboarding gate | 🟡 confirm row only | Blocking enrollment step until `isAccessibilityServiceEnabled()` |
| G5 | Reminder full-screen **overlay** | 🟡 partial | `ReminderNotifier` still uses notification full-screen-intent (heads-up on Android 14); the `showReminderOverlay` SYSTEM_ALERT_WINDOW bridge exists but is **not** wired into the reminders module (cross-module) |
| G6 | Airplane power | 🟡 best-effort code | On-device: confirm which fallback method works per OEM; may still be "unsupported" |
| G7 | Signed/HMAC SMS + replay protection | ❌ not built | Optional hardening; keep documented as convenience channel |
| G8 | Retailer WebView session persistence | 🟡 open (B1) | Flush WebView cookies or go native; needs decision |
| G9 | Secrets scrubbed to env-only | ❌ | §2 — FRP id + SMS numbers still in `config.ts` fallback |
| G10 | Web portal location history | ❌ | §7 — add `device_location_history` table + route + UI trail |

---

## 7. Web portal fixes (admin/retailer UI)

- [ ] **App info / build links look wrong on mobile.** The "App info & history" section
      currently shows raw Expo build URLs and device rows that render oddly on a phone. Replace
      with a single **"Manage device"** entry that redirects to the unified device-control page
      (the `DeviceManagementPanel` with all locks + actions), instead of linking to Expo.
- [ ] **Location: "Get current location" + history.** The panel must show a clear
      **Current location** card with a "Get current location" button (dispatches `LOCATION`) and a
      separate **Location history** trail. Today only the latest fix (`devices.last_location`) is
      kept, and SIM info (carrier/number) is easy to misread as history — split them into distinct
      cards with clear labels.
  - Backend to add: `device_location_history` table (device_id, lat, lng, accuracy, provider, at) +
    a POST `/api/device/heartbeat` append + a GET route for the admin panel; keep it RLS-protected.
- [ ] **Every app-lock function has an icon.** Verify each Lock/Unlock/App-lock/advanced-action
      control in `DeviceManagementPanel.tsx` carries a Lucide icon (Lock, Unlock, EyeOff, MapPin,
      Plane, Wifi, Bluetooth, Usb, PhoneOff, ImageIcon, Settings2, Power, etc.). The per-app
      "Lock / Unlock" buttons were fixed; re-check all rows.
- [ ] **Full web visual pass.** Render `/admin` and the device panel at mobile width; fix layout,
      spacing, and any accordion that looks broken. Keep the existing design system + Lucide icons.

---

## 8. Handoff checklist (do these before calling it done)

- [ ] `checksum.md` updated with build IDs, artifact URLs, SHA-256, and per-item device results.
- [ ] `ANDROID_MASTER_CHECKLIST.md` §1 table updated (NOT RUN rows resolved with real results).
- [ ] No secrets, exported customer data, or generated build trees committed; no push without authorization.
- [ ] Emergency calling, retailer contact, and authorized dispute/support unlock paths confirmed working on-device.

Anything still `[ ]` or "NOT RUN" above means the app is **not** production-ready.
