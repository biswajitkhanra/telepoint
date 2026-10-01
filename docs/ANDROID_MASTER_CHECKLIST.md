# TelePoint Android — Master Checklist (single source of truth)

Updated: 2026-10-01. **Read this together with `checksum.md` before changing any
code, and update both before handoff.** `checksum.md` is the short ledger; this
file is the full, comparable checklist every agent (Claude, Codex, Kilo, …) must
walk through and mark honestly.

Scope: **the Android customer app only** (`mobile/`, package
`com.telepoint.customer`). The web/`app/` console and the retailer WebView app
are out of scope here except where a command crosses the boundary.

---

## 0. Hard rules (do not violate)

1. Financing protection is legitimate **only** with a recorded agreement and a
   real **Device Owner** provisioning. A normal APK install, or Device Admin,
   does **not** enroll a Device Owner.
2. **Do not fake OS policy success.** Read the policy back from Android and
   report the true result. Failed/unsupported is a valid answer.
3. **Accessibility is owner-authorised on this financed phone — as a deterrent
   layer only.** An AccessibilityService cannot by itself guarantee blocking
   uninstall or factory reset, and it is always off in Safe Mode, so **Device
   Owner remains the guaranteed block** (`setUninstallBlocked` +
   `DISALLOW_FACTORY_RESET` + `DISALLOW_SAFE_BOOT` + `DISALLOW_ADD_USER` + FRP).
   The TelePoint `TelepointAccessibilityService` is an additional, explicitly
   owner-authorised layer that actively steers away from the uninstall /
   force-stop / clear-data / factory-reset screens while the loan is outstanding.
   It is enabled by the owner/store with the real system toggle (Device Owner
   best-effort silent enable, then the OS toggle) — never by faking a policy
   readback — and is disabled on release. See §3.
4. Never intercept system permission dialogs or force consent.
5. Release must always work: never re-lock or execute stale commands for
   COMPLETE / SETTLED loans; release clears **all** restrictions first, then
   removes Device Owner.
6. Keep repayment release, emergency calling, retailer contact and authorised
   unlock paths working at all times.
7. Do not commit secrets, exported customer data, or generated build trees.
   Do not push without the user's go-ahead.
8. A queued EAS build is **not** a successful build. A `tsc` pass does **not**
   compile Kotlin. Physical-device acceptance is the only real PASS.

---

## 1. Local verification commands (run before every handoff)

```powershell
# from mobile/
npx tsc --noEmit                                   # TypeScript must exit 0
node --test src/services/reminderScheduler.test.mjs src/services/deviceSync.test.mjs
```

| Command | Last run | Result |
| --- | --- | --- |
| `mobile: npx tsc --noEmit` | 2026-10-01 | **PASS (0)** |
| `web: npx tsc --noEmit` | 2026-10-01 | **PASS (0)** |
| `mobile: node --test reminderScheduler + deviceSync` | 2026-10-01 | **PASS (24/24)** |
| `mobile: npx expo export --platform android` | 2026-10-01 | **PASS** — JS bundle built (2755 modules, exit 0) |
| Kotlin/Gradle `assembleDebug` | 2026-10-01 | **NOT RUN** — no Android SDK/JDK on the build host |
| EAS customer build | 2026-10-01 | **FINISHED** — latest `6c996562` (current tree: new Kotlin + accessibility gate + FRP env + unlock-wins + protection reporting; APK + SHA-256 in checksum.md); device test still pending |
| EAS retailer build | — | **NOT RUN** |
| Physical Device-Owner phone | — | **NOT RUN** |

> Kotlin changes in this pass (`FinancingProtection.kt`,
> `TelepointAccessibilityService.kt` (new), `SmsCommandReceiver.kt`,
> `SmsCommandStore.kt`, `TelepointBootReceiver.kt`, `TelepointCommandService.kt`,
> `DeviceActions.kt`, `ExpoTelepointDeviceManagementModule.kt`, module
> `AndroidManifest.xml`, `res/xml/telepoint_accessibility_service.xml` (new)) have
> **not been compiled**. They must be built (EAS or local Gradle) before any
> device claim. Review carefully or compiler-check first.

---

## 2. Master requirement checklist (compare against live code)

Legend: ✅ code complete (still needs device confirm) · 🟡 partial / best-effort ·
⛔ missing · 📄 honest Android limitation (cannot be done, not faked).

### 2.1 Uninstall & reset protection (financer control until EMI paid)

| # | Requirement | Status | Code / evidence | Device acceptance |
| --- | --- | --- | --- | --- |
| U1 | Block uninstall while loan outstanding | ✅ | `FinancingProtection.apply` → `dpm.setUninstallBlocked(..., true)`; readback `isUninstallBlocked` | On Device-Owner phone, try uninstall in Settings + Play Store |
| U2 | Re-apply protection on enrollment | ✅ | `TelepointDeviceAdminReceiver.onProfileProvisioningComplete` → `FinancingProtection.restore` | Provision via QR, check `getProtectionStatus` |
| U3 | Re-apply protection on reboot | ✅ | `TelepointBootReceiver` → `FinancingProtection.restore` | Reboot, re-check status |
| U4 | Re-apply while loan RUNNING/NPA (authenticated) | ✅ | `deviceSync.syncDeviceCommandsOnce` → `applyFinancingProtection(true, FRP_ACCOUNTS)` | Online sync, check status |
| U5 | Block Settings factory reset | ✅ | `DISALLOW_FACTORY_RESET` (readback) | Settings → Reset → confirm blocked |
| U6 | Block Safe Mode | ✅ | `DISALLOW_SAFE_BOOT` | Hold power → confirm no Safe Mode |
| U7 | Block adding a second user | ✅ | `DISALLOW_ADD_USER` | Settings → Users |
| U8 | FRP (anti-wipe account) | ✅ code / 🟡 config | `setFactoryResetProtectionPolicy` (API 30+, Device Owner) | Needs the account's **numeric Gaia id** in `EXPO_PUBLIC_FRP_ACCOUNTS`; test on a disposable phone |
| U9 | Hardware/recovery wipe cannot be blocked | 📄 | No app can block it; FRP is the deterrent only | — |
| U10 | Protection released on COMPLETE/SETTLED | ✅ | `deviceSync` clears before commands; `releaseManagedRestrictions` | End-to-end paid-phone release |
| U11 | Release clears all policies before `clearDeviceOwnerApp` | ✅ | `releaseManagedRestrictions` order; FRP disable is best-effort and must not trap a paid customer | Paid release on Device-Owner phone |
| U12 | Hidden PIN 9088 diagnostics | ✅ | `DiagnosticScreen.tsx` + native `getPermissionDiagnostics`; tap version footer 7× in Profile | Open panel, confirm live rows |
| U13 | Accessibility deterrent (customer-consented) | ✅ code / 🟡 device | `TelepointAccessibilityService` steers away from uninstall / force-stop / clear-data / factory-reset AND the device-admin deactivation screen while outstanding; release-aware; enabled by the owner via `openAccessibilitySettings` (no silent enable); `isAccessibilityServiceEnabled` confirms; shown in PIN-9088 | Enable in front of the customer, attempt each screen, confirm steering; confirm it is off after COMPLETE/SETTLED |
| U14 | USB/ADB debugging blocked | ✅ code | `DISALLOW_DEBUGGING_FEATURES` added to `FinancingProtection.restrictions` with readback | Confirm via `getPermissionDiagnostics.debuggingBlocked` + `adb` refusal while outstanding |

### 2.2 Lock / unlock

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| L1 | Server-authorised LOCK with device ack | ✅ | `POST /api/device/command` (create) → poll `/api/device/commands` → `deviceSync` → `executeAuthorizedLock` → `ackCommand`; server sets LOCKED only on the device's EXECUTED ack |
| L2 | Kiosk / lock-task + HOME takeover (DO) | ✅ | `applyLockPolicies` + `startKioskIfPermitted` |
| L3 | Locked screen stays on screen (no per-poll lockNow) | ✅ | `deviceSync` deliberately skips repeated `lockNow` |
| L4 | Lock survives reboot | ✅ | `LockStateStore` + `TelepointBootReceiver` |
| L5 | UNLOCK only from backend; TOTP offline unlock | ✅ | `executeAuthorizedUnlock`, `Totp.kt`, `verifyTotpUnlock` |
| L7 | Native background command delivery (app closed) | ✅ code | `TelepointCommandService` + `CommandServiceStore`; `configureCommandService`/`startCommandService`; boot receiver restarts it |
| L6 | Online lock while app is fully closed | ✅ code | Native foreground service `TelepointCommandService` (module) polls `/api/device/commands` on its own schedule and executes LOCK/UNLOCK/DEVICE_ACTION with the app closed; auto-started after login and on boot; ack'd by the service. Device test pending. |

### 2.3 Device actions (Device Owner)

| # | Feature | Status | Evidence |
| --- | --- | --- | --- |
| A1 | Camera lock | ✅ | `setCameraDisabled` (Admin or Owner) |
| A2 | Bluetooth / USB / outgoing calls / wallpaper-change lock | ✅ | `addUserRestriction(DISALLOW_*)` |
| A3 | Wi-Fi config lock + real Wi-Fi power | ✅ | `DISALLOW_CONFIG_WIFI` + `setWifiEnabled` |
| A4 | Airplane **lock** | ✅ | `DISALLOW_AIRPLANE_MODE` |
| A5 | Airplane **power** toggle | 🟡 best-effort | `DeviceActions.setAirplaneMode`: global setting → reflection (`ConnectivityManager#setAirplaneMode`) → per-radio fallback (Wi-Fi/mobile-data/Bluetooth); reports which method worked; never faked |
| A6 | Reboot | ✅ | `dpm.reboot` (API 24+) |
| A7 | App hide (all other apps) | ✅ | `DeviceActions.hideAllUserApps` |
| A8 | Per-app lock | ✅ | `setPackagesSuspended` (DO) **and** `AppLockStore` + full-screen PIN overlay (`TelepointOverlay` "applock") driven by accessibility foreground detection. 3 wrong PINs escalate to a FULL phone lock (`DeviceActions.hardLock`) |
| A9 | Branded overdue wallpaper + restore | ✅ | `WallpaperManagerHelper` |
| A10 | Location + SIM info | ✅ | `getLocation`, `getSimInfo`; DO auto-grants perms |
| A11 | Tracking on/off + heartbeat | ✅ | `TrackingStore` |
| A12 | Full-screen overlay pop (Display over other apps) | ✅ code / 🟡 device | `TelepointOverlay` (SYSTEM_ALERT_WINDOW) shows lock/reminder/app-lock covers immediately over any app; falls back to launching the app if overlay not granted |
| A13 | Call lock while locked | ✅ | `LockPolicies` adds `DISALLOW_OUTGOING_CALLS` while locked + overlay over the in-call screen (best-effort); cleared on unlock/release |

### 2.4 Offline channels

| # | Feature | Status | Evidence / caveat |
| --- | --- | --- | --- |
| O1 | SMS LOCK / UNLOCK / REBOOT / LOC / feature ON-OFF / HIDE / TRACK / WALL | ✅ | `SmsCommandReceiver` — sender allowlist + customer code. **Not cryptographically authenticated** (sender IDs spoofable). |
| O2 | SIM sentinel (removal/swap → lock + alert) | ✅ | `SimSentinelReceiver` + `SimSentinelStore` |
| O3 | OEM autostart (MIUI/Vivo/Oppo) | ✅ | `OemPermissionHelper` |

### 2.5 Reminders

| # | Feature | Status | Evidence |
| --- | --- | --- | --- |
| R1 | Days −5..−2 at 10:00/18:00; −1 hourly; due-day hourly; overdue every 5 min | ✅ logic | `reminderScheduler.ts` (unit-tested 16/16) |
| R2 | Voice on due day, Bengali/Hindi | ✅ logic / 🟡 device | native TTS path |
| R3 | Offline, exact alarms, reboot/timezone restore | ✅ logic / 🟡 device | `expo-telepoint-reminders` |
| R4 | Full-screen reminder takeover | 🟡 | Heads-up notification + photo + voice; **not** a background full-screen overlay |
| R5 | No logout / account switch until paid | ✅ | `ProfileScreen` gate: logout / "Log in as Another Customer" / role switch hidden until COMPLETE/SETTLED (ProfileScreen.tsx:361-434). The linked-loan switcher stays visible while unpaid — that is same-account loan switching, not an account switch |

---

## 3. Accessibility + Device Owner vs. uninstall/reset — the honest answer

The requirement is to prevent the app being uninstalled and the phone being reset
until the EMI is paid. What is true on Android:

- **Only Device Owner can actually block them** — `setUninstallBlocked` +
  `DISALLOW_FACTORY_RESET` (+ `DISALLOW_SAFE_BOOT` + `DISALLOW_ADD_USER` + FRP).
  That is exactly what this app uses and it is the guaranteed control (§2.1/U1–U11).
- **An AccessibilityService cannot, on its own, guarantee blocking either
  action.** It can only observe windows and simulate Back/Home; it is disabled if
  the user turns it off, and it is always disabled in Safe Mode.
- **Decision (owner-authorised):** the TelePoint `TelepointAccessibilityService`
  is added as an **additional, explicitly owner-authorised deterrent layer** that
  actively steers away from the uninstall, force-stop, clear-data and
  factory-reset screens while the loan is outstanding. It never replaces Device
  Owner and must never be reported as the guaranteed block. It does not touch
  emergency calling, stores no screen content, and is disabled on release.
- It is enabled by the owner/store with the real system toggle — customer-consented
  at provisioning (`openAccessibilitySettings` opens the OS Accessibility screen).
  The app has **no silent/remote enable path**; it only CONFIRMS the live state
  (PIN-9088 panel / heartbeat). `AGENTS.md` item 4 records this authorised
  exception (previously accessibility was removed entirely).

What the owner can now do: the hidden **PIN 9088** panel shows the live on/off
state of Device Owner, uninstall block, factory-reset block, Safe Mode block,
FRP, **accessibility deterrent**, **USB-debugging block**, **force-stop/clear-data
block**, overlay, notifications, exact alarms, battery, SMS/location/phone perms,
and opens the right OS screen for anything missing.

**Where "Display over other apps" DOES matter:** the native background command
service can execute a LOCK with the app closed, but Android 10+ blocks a
background app from showing a screen. A background activity start *is* allowed
when the app holds `SYSTEM_ALERT_WINDOW`, so granting it lets the lock screen
appear immediately over whatever the customer is using. Without it the screen
still locks (and the kiosk HOME takeover applies), but the branded lock screen
appears on next wake. Grant it from the PIN-9088 panel.

**Background works while the phone is closed:** `TelepointCommandService` is a
native foreground service that polls `/api/device/commands` on its own schedule
(idle 30 s, fast 6 s while locked or just after any command) and executes +
acknowledges LOCK/UNLOCK/DEVICE_ACTION with the React app closed; it is started
after login and from `TelepointBootReceiver` on boot.

---

## 4. Device acceptance script (disposable Device-Owner phone)

Provision a **fresh/reset** phone as Device Owner (QR at setup, see
`docs/DEVICE_OWNER_PROVISIONING.md`), then verify and record model, Android
version, build ID, and actual result for each:

1. `getProtectionStatus` / PIN-9088 panel shows uninstall + factory-reset +
   Safe-Mode blocked = true; FRP supported = true (API 30+).
2. Try uninstall from Settings and from Play Store → blocked.
3. Settings → System → Reset → factory reset → blocked.
4. Power menu → Safe Mode → not offered.
5. Settings → Users → add user → blocked.
6. Reboot → device returns to the TelePoint lock; status still enforced.
7. Offline SMS `LOCK <code>` from an allowlisted number → locks; `UNLOCK <code>`
   → unlocks.
8. Remove SIM → sentinel locks + alerts.
9. Admin issues UNLOCK online → applied + acked; lock screen exits.
10. Mark loan COMPLETE/SETTLED → all restrictions cleared, Device Owner removed,
    app uninstallable.
11. Emergency call (112/108) still works while locked.
12. Retailer contact / support path still works while locked.

Nothing here has been performed in this workspace — all rows are **NOT TESTED on
device**.

---

## 4.5 MUST-IMPLEMENT CHECKLIST — walk this BEFORE any build or deploy

This is the consolidated "everything that must be true" list. Every un-ticked box is
unfinished; **accessibility is mandatory**, not optional. Verify each against live
code (not docs) and record evidence.

### A. Accessibility service (REQUIRED — owner-authorized)

- [x] `TelepointAccessibilityService.kt` implemented (window-state observer; steer away
      from uninstall / force-stop / clear-data / factory-reset screens). Verified:
      `TelepointAccessibilityService.kt:53-107` (release guard :56, installer BACK :82-88,
      Settings HOME :91-105). Generic Settings tampering (date/time) is Device-Owner-only
      (`DISALLOW_CONFIG_DATE_TIME`, FinancingProtection.kt:19) — not claimed by the service.
- [x] `res/xml/telepoint_accessibility_service.xml` declares the event types. Verified:
      `typeWindowStateChanged|typeWindowContentChanged`, `canRetrieveWindowContent="true"`,
      `flagDefault|flagRetrieveInteractiveWindows|flagReportViewIds`.
- [x] Module `AndroidManifest.xml` `<service>` with
      `android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"`, the
      `android.accessibilityservice.AccessibilityService` intent-filter and meta-data.
      Verified: `AndroidManifest.xml:101-112`.
- [x] JS bridge exposes `isAccessibilityServiceEnabled()` and `openAccessibilitySettings()`
      (index.ts:241-253 → Module.kt:351-357, real `Settings.ACTION_ACCESSIBILITY_SETTINGS`).
      `enableAccessibilityIfOwner()` deliberately does NOT exist — there is no silent or
      remote enable path (TelepointAccessibilityService.kt:153-155).
- [x] Consent-based enable only: confirmed at provisioning via the PIN-9088 panel / real
      system toggle. Deliberately NOT re-enabled on boot or on LOCK (AuthContext.tsx:35-37,
      TelepointBootReceiver.kt:35-37, TelepointCommandService.kt:205-209). Disabled on
      COMPLETE/SETTLED in all three release paths (Module.kt:647, TelepointCommandService.kt:221,
      DeviceActions.kt:166). Blocking onboarding gate added 2026-10-01: `AccessibilityGateScreen`
      blocks the customer app while the loan is RUNNING/NPA on a Device-Owner phone until the
      live OS state is ON (emergency 112 + retailer contact stay reachable from the gate).
- [x] Real OS readback (never faked); PIN-9088 shows `accessibilityEnabled` with an
      Open-settings action (DiagnosticScreen.tsx:167-170; live read
      TelepointAccessibilityService.kt:139-151).
- [x] `setPermittedAccessibilityServices` is deliberately NOT set while outstanding — it must
      not restrict the customer's other accessibility services (AGENTS.md rule 4). Any
      previously-set restriction is cleared with `null` on release
      (FinancingProtection.kt:52-59). Service disabled and inert on COMPLETE/SETTLED.
- [x] Honest limits preserved: deterrent only; never claimed to block a hardware/recovery
      wipe; Device Owner remains the guaranteed block (service KDoc lines 14-35).

### B. Device Owner protective controls (guaranteed block)

- [x] `setUninstallBlocked` (apply + readback + re-apply on enrollment/boot/sync).
      Verified: FinancingProtection.kt:40,:107; TelepointDeviceAdminReceiver.kt:34-35;
      TelepointBootReceiver.kt:33; deviceSync.ts:85-86.
- [x] `DISALLOW_FACTORY_RESET`, `DISALLOW_SAFE_BOOT`, `DISALLOW_ADD_USER`,
      `DISALLOW_DEBUGGING_FEATURES` (apply + readback). Verified:
      FinancingProtection.kt:15-23,:46-50,:108-111; diagnostics live-read Module.kt:322-324,:339.
- [x] FRP `setFactoryResetProtectionPolicy` (API 30+, numeric Gaia id); best-effort disable
      on release that cannot trap a paid customer. Verified + hardened 2026-10-01: apply
      blocks on readback failure; unsupported-while-active and missing-account now report
      `frp_apply` / `frp_accounts_missing`; a thrown disable re-reads FRP and reports
      `frp_release` if still on (FinancingProtection.kt:61-102). Hard-coded default Gaia id
      REMOVED (config.ts — fail-safe empty; set `EXPO_PUBLIC_FRP_ACCOUNTS` explicitly).
      PIN-9088 now shows live `frpEnabled`.
- [x] `setUserControlDisabledPackages` (force-stop/clear-data) on API 30+. Verified:
      FinancingProtection.kt:41-45,:112-114; diagnostics Module.kt:339-341.

### C. Lock / release correctness

- [x] Server-authorised LOCK with device ack (no fake "locked" on button press). Verified:
      app/api/device/commands/route.ts:39-42 (ACTIVE only), deviceSync.ts:215-224; server sets
      LOCKED only on the device's EXECUTED ack (app/api/device/command/ack/route.ts:53-57);
      UI "locked" only from server readback / executed result / persisted policy
      (useDeviceCommands.ts:80-90,:131-133,:142-156).
- [x] Lock survives reboot (kiosk + HOME takeover). Verified: LockStateStore + boot receiver
      re-assert (lockNow + relaunch, TelepointBootReceiver.kt:45-61); kiosk/HOME policies are
      DPM-persistent (LockPolicies.kt:27,:63) and kiosk re-enters on the relaunched app's
      launch-effect lockNow (Module.kt:187-193, useDeviceCommands.ts:145-152).
- [x] Release before commands; no stale locks for COMPLETE/SETTLED; all restrictions,
      accessibility, FRP, hidden/suspended apps and tracking cleared. Verified:
      deviceSync.ts:63-72 (tested: deviceSync.test.mjs:51-66), TelepointCommandService.kt:168-178,
      Module.kt:635-664 (`clearDeviceOwnerApp` only after policies cleared, :655-661),
      DeviceActions.kt:133-167.

### D. Channels, reminders, data

- [x] Reminder engine (10:00/18:00, day-before hourly, due-day hourly, overdue 5-min,
      due-day voice bn/hi, reboot/tz restore). Verified: reminderScheduler.ts:86-212;
      ReminderBootReceiver.kt:15-24 + manifest intent-filters; TTS bn/hi ReminderReceiver.kt:82.
      Logic tests re-run 2026-10-01: 24/24 PASS.
- [x] Offline SMS commands (sender allowlist + customer code) and SIM sentinel. Verified:
      SmsCommandReceiver.kt:53-118 (LOCK/UNLOCK/REBOOT/LOC/feature ON-OFF/HIDE/TRACK/WALL);
      +91 normalization SmsCommandStore.kt:37-41; bounded non-PII last-event :25-35;
      SIM sentinel SimSentinelReceiver.kt:32-49. NOT cryptographically authenticated
      (sender spoofable) — allowlist + customer code only.
- [x] TOTP offline unlock (Totp.kt:19-80, RFC 6238); server twin RFC-vector tested
      (lib/totp.test.mjs). ⚠ Native Totp.kt has NO Kotlin unit test in-repo — add one
      (RFC 6238 vectors, ±window) or keep this caveat until device test. Migrations
      030–032, 034–036 exist and are applied via APPLY_ALL (033 never existed —
      `migrations/APPLY_ALL_device_management.sql:5`); RLS/policy changes in 030/031/032;
      no service-role key in mobile/ (anon key only); no `QUERY_ALL_PACKAGES`.

### E. Pre-deploy gate (only after A–D are ticked)

- [x] `mobile` + web `tsc --noEmit` exit 0; `node --test` logic suites pass.
      Re-verified 2026-10-01: mobile tsc PASS (0), web tsc PASS (0), node --test 24/24 PASS.
- [x] Kotlin compiled by EAS/Gradle (a queued build is **not** a pass). EAS customer build
      `7d2b9bd3-e51d-4598-b5a2-07109479e2f4` **FINISHED** 2026-10-01 from the CURRENT tree
      (`compileReleaseKotlin` passed; first attempt `63be3c4a` had one error —
      TelepointOverlay.kt:109 nullable `pkg` — fixed, then `c5f2da04` passed, then this build
      added the accessibility gate + FRP env). APK URL + SHA-256 in checksum.md.
- [ ] Customer + retailer EAS builds **FINISHED** with artifact URL + SHA-256 for the
      CURRENT code. Customer: **DONE** (`7d2b9bd3`,
      `https://expo.dev/artifacts/eas/BrPsCJ79lCi4fGlIPKbAxlXpn-MyrAuS2zsTSQipZuU.apk`,
      SHA-256 `F1EAB350A4948F5BDEB46D5245C6B875C27F76CAA8400C1FE21C710848CD806A`;
      earlier `c5f2da04` also FINISHED). Retailer: NOT RUN.
- [ ] Commands endpoint deployed (authoritative `loan_status`).
- [ ] §4 acceptance script executed on a disposable Device-Owner phone.
- [x] `checksum.md` updated with the evidence.

---

## 5. Build & release gate

1. `mobile` typecheck + logic tests pass (§1).
2. Kotlin compiles: `cd mobile; npx expo prebuild --clean` then Gradle, or an EAS
   build. Capture the build log; a queued build is not a pass.
3. `eas build -p android --profile customer` → **FINISHED**; record artifact URL
   + APK SHA-256.
4. `eas build -p android --profile retailer` → **FINISHED**; record URL + SHA-256.
5. Apply migrations (`migrations/030+`) and deploy the commands endpoint so
   authoritative `loan_status` is independent of the due-breakdown RPC.
6. Run §4 on a real phone; update `checksum.md` with the evidence.

**Future agents:** if you cannot run a step, write "NOT RUN" — never mark it
done. An unchecked box means unfinished, not approved.
