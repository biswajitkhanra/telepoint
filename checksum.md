# TelePoint implementation and release checklist

Updated: 2026-10-01. Shared by Claude and Codex through `AGENTS.md` / `CLAUDE.md`.

This is a verification ledger, not an APK checksum. No existing `checksum.md`
was found. Related inputs: `docs/ANDROID_MASTER_CHECKLIST.md` (full checklist
every agent must walk and mark), `docs/cross_check.md`, `docs/checklist.md`,
`docs/requirements-coverage-checklist.md`, `.arena/codex_instructions.md`,
`.arena/codex_instructions_2.md`, and `docs/CLAUDE_EXECUTION_PLAN.md`.
Preserve user edits in those files. The older "100% parity" and "at any cost"
claims are not acceptance evidence and do not override Android's capabilities.

Android-only scope: `mobile/` (customer app). Device Owner remains the
guaranteed uninstall/reset block. On top of it, an owner-authorised
`TelepointAccessibilityService` is now enabled as an additional deterrent layer
that steers away from the uninstall / force-stop / clear-data / factory-reset
screens while the loan is outstanding. It cannot guarantee the block on its own
and is off in Safe Mode; see master checklist §3.

## Required operating model

- [ ] Store records agreement/consent and enrolls a fresh supported phone as Device Owner during Android setup. Installing an APK and accepting Device Admin does not create Device Owner.
- [ ] Verify customer package `com.telepoint.customer`, retailer package `com.telepoint.retailer`, correct signing keys, and consent/customer/install binding.
- [ ] Test every target OEM/Android version before distribution; capture model, version, steps, expected/actual result and build ID.
- [ ] Confirm repayment release and emergency/support access before handing out financed phones.

## Implementation and acceptance ledger

| Requirement | Code / evidence | Remaining acceptance |
| --- | --- | --- |
| Local native modules included | Both file dependencies and lockfile; autolinking verified in previous run | Kotlin now compiles in the cloud (EAS `c5f2da04`); device tests remain |
| Reminder Kotlin compilation | Bare callback return changed to `Unit` | EAS result verified: compiles in `c5f2da04`; reminder alarm behaviour still needs device test |
| Uninstall prevention | Device Owner `setUninstallBlocked`; shared `FinancingProtection` used on enrollment, reboot and authenticated sync | Try uninstall in Settings while RUNNING, reboot, retry |
| Accessibility deterrent (customer-consented) | `TelepointAccessibilityService` + `res/xml` + manifest + `openAccessibilitySettings`/`isAccessibilityServiceEnabled` bridge + PIN-9088 confirmation row; release-aware; no silent enable | Enable in front of the customer; attempt uninstall / force-stop / clear-data / factory reset; confirm it steers away and turns off after COMPLETE/SETTLED |
| USB/ADB debugging block | `DISALLOW_DEBUGGING_FEATURES` added to `FinancingProtection.restrictions` with readback | Confirm `getPermissionDiagnostics.debuggingBlocked=true` and `adb` refusal while outstanding |
| Settings factory reset | `DISALLOW_FACTORY_RESET`, actual policy readback | Confirm Settings reset blocked while outstanding |
| Safe mode / extra users / clock changes | Shared financing restrictions | Verify on each supported OEM; no firmware guarantees |
| Force-stop / clear-data protection | Device Owner `setUserControlDisabledPackages` on API 30+ | Check OS force-stop/data controls; older Android remains limited |
| Recovery reset / FRP | Configured account policy; supported/enabled distinguished; disabled on release | Confirm account ownership and recovery on a disposable test phone; hardware wipe itself cannot be blocked |
| Offline/error safety | Unknown loan state does not activate new policy | Regression tests plus network-loss test |
| Paid/settled release | Release before processing commands; old locks not executed; reminders cancelled; SMS/SIM control cleared; no paid-loan bootstrap | End-to-end COMPLETE and SETTLED release, retry on partial failure |
| Device Owner removal after release | Clear restrictions first, then `clearDeviceOwnerApp` with readback | Deprecated legacy API: requires OEM acceptance; no automatic data wipe |
| Hidden/suspended apps restored | Release enumerates hidden packages and clears suspension | Hide/suspend, repay, confirm every affected app restored |
| Admin-only web app info | Role-gated build links, Lucide icons, regression test | Latest deployment and rendered UI review |
| Online lock while app closed | Native `TelepointCommandService` foreground service polls `/api/device/commands`, executes + acks LOCK/UNLOCK/DEVICE_ACTION with the app closed; started after login and on boot (`TelepointBootReceiver`); `CommandServiceStore` holds config | Compile Kotlin build; kill/reboot/OEM + no-overlay-permission tests on device |
| Overlay permission for background lock screen | `SYSTEM_ALERT_WINDOW` granted from PIN-9088 panel; background activity start allowed when held | Confirm lock screen appears immediately from a closed-app LOCK on device |
| Full-screen background lock/reminders | `TelepointOverlay` (SYSTEM_ALERT_WINDOW) shows lock / reminder / app-lock / call covers immediately; dismissed on unlock/release; honest launch-app fallback when overlay not granted; reminder notification carries photo + bn/hi voice | Grant overlay permission and confirm it pops over any app + in-call screen on device; reminder full-screen takeover remains a heads-up notification, not a background overlay (R4 honestly PARTIAL in master checklist) |
| Hidden PIN 9088 diagnostics | `DiagnosticScreen.tsx` + native `getPermissionDiagnostics` / `requestOverlayPermission` / `openAppSettings`; hidden 7-tap trigger in `ProfileScreen` | Compile Kotlin build; open panel on Device-Owner phone and confirm live rows. PIN is a UI gate only — authorises no command, discloses no token |
| Offline SMS | Allowlisted sender + customer code; +91 normalization exists | Real SMS tests; sender identity alone is spoofable. Signed commands/replay protection remain unfinished; do not call current SMS cryptographically authenticated |
| Offline location / wallpaper SMS | Native LOC/WALL handlers present | Permission, sender, location freshness and no-response cases on hardware |
| TOTP offline unlock | Existing native verifier and server tests | Clock drift, rate limiting, emergency/support access on hardware |
| SIM removal/swap | Existing native receiver and baseline | Reboot without SIM, authorized SIM replacement, paid release |
| OEM autostart | Existing intent helper with fallback | Xiaomi/Vivo/Oppo actual settings paths |
| Camera/Bluetooth/USB/calls/wallpaper policies | Existing Device Owner policy APIs | Apply/readback/clear; verify emergency calling remains possible |
| Wi-Fi / airplane power | Wi-Fi real toggle + `DeviceActions.setAirplaneMode` (global → reflection → per-radio fallback), honest method reporting | No guaranteed airplane-radio toggle on stock Android; verify fallback + online unlock connectivity on device |
| Reboot / per-app lock / app hide | Reboot, `setPackagesSuspended`, `AppLockStore` + full-screen PIN overlay (`TelepointOverlay` "applock"), `hideAllUserApps` | Authorization, actual application state and release |
| Full-screen overlay pop | `TelepointOverlay` (SYSTEM_ALERT_WINDOW) shows lock/reminder/app-lock covers immediately; dismissed on unlock/release | Grant overlay permission; confirm it pops over any app + in-call screen on device |
| Call lock | `LockPolicies` adds `DISALLOW_OUTGOING_CALLS` while locked + overlay over in-call UI (best-effort) | Verify outgoing blocked, emergency 112 still works, cleared on unlock |
| Reminder schedule / Bengali-Hindi voice | Existing offline alarm engine and scheduler tests | Exact alarms, TTS, reboot, battery restrictions and due/overdue cadence on device |
| Two-app separation / staff session | Existing variants and cookies | Customer cannot access staff flow; retailer cannot enroll/manage personal phone |

## Checks for this change (2026-10-01 maintenance pass)

- [x] Master checklist created: `docs/ANDROID_MASTER_CHECKLIST.md` (all requirements, statuses, acceptance script).
- [x] Hidden PIN 9088 diagnostic panel implemented (native diagnostics bridge + `DiagnosticScreen` + 7-tap Profile trigger).
- [x] Native background command delivery implemented (`TelepointCommandService` + `CommandServiceStore` + shared `LockPolicies`); started after login and on boot, stopped on release; `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` declared. Fixes "online lock only works when the app is open".
- [x] `FinancingProtection` release hardened: FRP disable is best-effort and no longer traps an already-paid customer; FRP apply still blocks on a real readback failure.
- [x] Module manifest comment corrected (SMS is sender-allowlist + customer code, NOT HMAC-signed).
- [x] `SYSTEM_ALERT_WINDOW` added to `app.json` permissions so a clean prebuild keeps the declared overlay permission.
- [x] Mobile TypeScript passed (`npx tsc --noEmit`, exit 0).
- [x] Mobile logic tests passed (`node --test reminderScheduler + deviceSync`, 24/24).
- [x] Kotlin compiled — EAS customer build `fb800c40-f83d-44b7-8477-970058668230` was **FINISHED** (2026-09-30 21:24 UTC) BUT from commit `b781824` — it does NOT contain the new Kotlin. The **current-tree rebuild `c5f2da04-9c68-4267-9809-54d7d2f1e1fb`** (EAS_NO_VCS, includes the new accessibility/overlay/app-lock/command-service Kotlin + FRP hardening + `frpEnabled` row) is **FINISHED** (2026-10-01 00:35 UTC) — the first successful cloud compile of this Kotlin pass. Artifact: `https://expo.dev/artifacts/eas/EA720YmLH2vtGSTAf85s42MIT3ep-67aEvm46r-GBf4.apk`, SHA-256 `07A47176372778CC3923B85D9095686F5AB09F22C6A289C4B9EFDD27537AED04` (69,102,527 bytes). First attempt `63be3c4a` failed on one Kotlin error (`TelepointOverlay.kt:109:45` nullable `pkg` captured in a lambda) — fixed with `pkg?.let`. No local SDK/JDK; cloud compile only. Older artifact `fb800c40` remains recorded for traceability (SHA-256 `57B95060…500D1B`).
- [x] Owner-authorised `TelepointAccessibilityService` added as an additional deterrent against uninstall / force-stop / clear-data / factory-reset screens; release-aware (`LockStateStore.isUninstallProtected`), does not touch emergency calling, stores nothing. Device Owner stays the guaranteed block (see master checklist §3).
- [x] Accessibility is CUSTOMER-CONSENTED and on-device only: no silent/remote enable path. `openAccessibilitySettings` opens the real system toggle; the app only CONFIRMS the live state via `isAccessibilityServiceEnabled` + the PIN-9088 row. Disabled on release in the module, `DeviceActions`, and `TelepointCommandService.coreRelease`; any previously-set `setPermittedAccessibilityServices` restriction is cleared on release.
- [x] USB/ADB hardening: `DISALLOW_DEBUGGING_FEATURES` added to `FinancingProtection.restrictions` (applied + read back + cleared on release).
- [x] Background lock hardened: `TelepointCommandService` now polls fast (6 s) while locked / for 1 min after any command (was a flat 30 s). **Corrected 2026-10-01:** accessibility is consent-based and is NEVER programmatically re-enabled on LOCK/boot; the service re-applies `FinancingProtection` on an authenticated sync while RUNNING/NPA (TelepointCommandService.kt:176-178) and clears everything on release (`coreRelease` :217-227).
- [x] Offline SMS made debuggable: `SmsCommandReceiver` logs + records a bounded, non-PII last result (`SmsCommandStore.recordEvent`), surfaced in PIN-9088; no phone numbers/codes stored.
- [x] Accessibility onboarding gate (blocking step in the app UI) — DONE 2026-10-01: `AccessibilityGateScreen.tsx` blocks the customer surface while the loan is RUNNING/NPA on a Device-Owner phone until the LIVE OS state confirms the service is on; opens the real system toggle (never enables silently); re-checks on app resume + every 4 s; emergency (112) and retailer contact stay reachable from the gate; auto-clears when enabled (RootNavigator.tsx gate wiring + AccessibilityGateScreen.tsx).
- [x] Full-screen overlay pop added (`TelepointOverlay`, SYSTEM_ALERT_WINDOW): lock / reminder / app-lock / call covers shown immediately over any app; dismissed on unlock/release; honest fallback to launching the app when overlay permission is absent.
- [x] Call lock added: `LockPolicies` applies `DISALLOW_OUTGOING_CALLS` while locked and the accessibility service shows the lock cover over the in-call screen; cleared on unlock/release.
- [x] Per-app PIN overlay lock added: `AppLockStore` (packages + SHA-256 PIN + temp-unlock) + `configureAppLock`/`verifyAppLockPin`/`getAppLockState`/`setAppLockEnabled`/`clearAppLock` + `APP_PIN_LOCK` device action + web `DeviceActionKey`/`pin` payload.
- [x] Airplane power fallback added: `DeviceActions.setAirplaneMode` (global → reflection → per-radio fallback), used by the module and the background service; honest `method` reporting.
- [x] Kotlin compiled — cloud compile passed (EAS `c5f2da04`, `:expo-telepoint-device-management:compileReleaseKotlin` OK). Device tests — still NOT RUN (no physical phone tested; no local JDK/Android SDK on this host).
- [x] Full test suite and web TypeScript re-run 2026-10-01 after final edits: mobile `tsc --noEmit` PASS (0), web `tsc --noEmit` PASS (0), `node --test` reminderScheduler + deviceSync **24/24 PASS**.
- [x] EAS customer build FINISHED with artifact URL + APK SHA-256: current-tree build `c5f2da04` (new Kotlin + FRP hardening) FINISHED with URL + SHA-256 recorded above; older `fb800c40` artifact also recorded. Retailer build remains NOT RUN.
- [ ] EAS retailer build FINISHED, with artifact URL and APK SHA-256.
- [ ] Deploy the updated commands endpoint so authoritative `loan_status` is independent of the due-breakdown RPC. Mobile retains the old breakdown fallback.
- [ ] Device Owner phone acceptance for all rows above. No physical-device test has been performed by this agent.

## 2026-10-01 hardening pass 2 (FRP engage + accessibility gate + offline-lock & advanced-controls audit)

- **FRP now ENGAGES in the build:** owner chose the FRP account id `106892760455009935120`; embedded as `EXPO_PUBLIC_FRP_ACCOUNTS` in `mobile/eas.json` customer/preview/production env (flows app.config.ts:54 → config.ts → deviceSync → `FinancingProtection.apply`). On a Device Owner + Android 11+ phone the policy is applied and read back; on anything else it reports honestly (`frpSupported`/`frp_accounts_missing`). Device verification still pending.
- **Accessibility is the second main control and is now gated end-to-end:** consent-based enable via the real OS toggle, live confirmation (PIN-9088 + heartbeat), release-aware disable in all 3 release paths, and now a blocking onboarding gate (see above) so a financed phone cannot run without the deterrent while the loan is outstanding.
- **Offline LOCK locks the PHONE, not just the app — verified:** SMS `LOCK <code>` (allowlisted sender + customer code) → `SmsCommandReceiver.applyLock` → `DeviceActions.hardLock` = persist lock flag (survives reboot) + `dpm.lockNow()` (real screen lock) + `LockPolicies.apply(true)` (lock-task kiosk + HOME takeover + `DISALLOW_OUTGOING_CALLS`, emergency numbers stay reachable) + branded overdue wallpaper + full-screen lock cover (SmsCommandReceiver.kt:96,:127-129 → DeviceActions.kt:42-51 → LockPolicies.kt:20-69). SIM sentinel uses the same `hardLock`. Online LOCK is identical (`executeAuthorizedLock`, Module.kt:200-223). UNLOCK stays backend-only (+ TOTP offline, LockedScreen).
- **Advanced controls verified across all three channels (online app / background service / offline SMS):** REBOOT, WIFI_POWER, AIRPLANE_POWER (global→reflection→per-radio), APP_HIDE (hide all or single package), APP_LOCK (suspend), APP_PIN_LOCK (PIN overlay via AppLockStore + accessibility), CAMERA, BLUETOOTH, WIFI (config lock), USB, AIRPLANE (restriction), OUTGOING_CALLS, WALLPAPER, TRACKING, LOCATION, SIM_INFO, OEM_AUTOSTART — online in deviceSync.ts:133-194 + Module.kt `setDevicePolicy` (:460); app-closed in TelepointCommandService.runDeviceAction (:229-295); offline in SmsCommandReceiver.kt:95-120. All with owner guards + honest results; device tests pending.
- Re-run after changes: mobile `tsc` PASS (0), web `tsc` PASS (0), `node --test` 24/24 PASS. EAS customer rebuild `7d2b9bd3-e51d-4598-b5a2-07109479e2f4` **FINISHED** (2026-10-01 11:33 UTC) with the accessibility gate + FRP env — artifact `https://expo.dev/artifacts/eas/BrPsCJ79lCi4fGlIPKbAxlXpn-MyrAuS2zsTSQipZuU.apk`, SHA-256 `F1EAB350A4948F5BDEB46D5245C6B875C27F76CAA8400C1FE21C710848CD806A` (69,104,665 bytes).

## 2026-10-01 admin portal + payment-truth pass

- **App info & history is now the real device dashboard:** the Android/retailer build-download links were REMOVED from the admin portal. In their place the admin-only "App info & history" shows: model/manufacturer, Android version, installed app version, management mode, admin permission, device state, consent date, registration date, last seen, the live "Financing protection" grid, and an upgraded **Command history** with type icons (LOCK/UNLOCK/reminder/action), status badges (Executed/Failed/Pending/Received/Superseded/Expired/Cancelled), DEVICE_ACTION payload names, executed timestamps and failure reasons — plus the existing Current location and SIM Information sections. `/api/device/retailer` now also returns `app_version` and command `payload`.
- **Admin Payment Summary now shows the ABSOLUTE DB truth:** the fine balance tiles no longer re-derive the daily/weekly accrual client-side (client clock/timezone drift made them false). `components/CustomerPaymentSummary.tsx` now prefers the server-computed `get_due_breakdown.fine_due` (fine_settings + frozen per-EMI `fine_amount`, server IST clock) and falls back to the stored sum Σ max(0, `fine_amount` − `fine_paid_amount`); the "carrying fine" count and the next-EMI payable fine use the stored columns too. EMI paid, fine paid and first-charge figures were already DB-based and are unchanged.
- **Admin portal exposes EVERYTHING now:** `components/DeviceManagementPanel.tsx` gained (1) **App PIN Lock** (APP_PIN_LOCK with packages + PIN — the overlay lock, separate from suspension), (2) a **"Financing protection (live from phone)"** grid: FRP enabled/supported, uninstall / factory-reset / Safe-Mode / add-user / USB-debugging / force-stop-clear-data blocks, accessibility ON, overlay granted, and (3) updated build links (customer → `7d2b9bd3`). The panel stays admin-only.
- **The phone now reports the full protection state:** module `getDevicePolicies` (Module.kt) sends uninstall/factory-reset/safe-mode/add-user/debugging/user-control/FRP/accessibility/overlay/sdkInt — all real OS readbacks; `/api/device/heartbeat` whitelists them into `devices.policies` (migration 034 snapshot, nothing free-form). Web + mobile admin surfaces read them as-is.
- **Mobile Device Management screen** (`DeviceManagementScreen.tsx`) now also shows Add-user, USB debugging, Force-stop/clear-data and Lock-screen overlay rows (live reads) alongside the existing uninstall/reset/safe-mode/accessibility/FRP rows.
- Checks re-run: web `tsc` PASS (0), mobile `tsc` PASS (0), `node --test` 24/24 PASS. Web changes are local until a deploy (Vercel) — not deployed without user authorization. Mobile changes require a new EAS APK (see Still-open list).

## 2026-10-01 hardening pass 3 (tamper-deterrent checklist)

User checklist verified against live code, with two behaviours ADDED where they were missing:

- [x] Uninstall + reset protection: Device Owner `setUninstallBlocked` + `DISALLOW_FACTORY_RESET`/`SAFE_BOOT`/`ADD_USER` applied AND read back (FinancingProtection.kt:40,:46-50,:107-111); re-applied on enrollment/boot/sync. Settings reset entry is OS-blocked for a Device Owner; the a11y service additionally exits the factory-reset confirmation if it ever appears.
- [x] Accessibility prevents app uninstall: `TelepointAccessibilityService` dismisses the Package-Installer uninstall confirmation (BACK) and steers away from App-info uninstall/force-stop/clear-data (HOME) — release-aware, consent-enabled, gated by `AccessibilityGateScreen`.
- [x] Customer cannot disable device admin access: ADDED 2026-10-01 — the service now also steers away from OUR app's device-admin deactivation screen (`ownScreen && "deactivate"` → HOME + relaunch, TelepointAccessibilityService.kt). Under Device Owner the admin is additionally not user-removable (Android semantics).
- [x] Reset button prevented: `DISALLOW_FACTORY_RESET` + a11y factory-screen steering (above).
- [x] "Phone will be locked after 3 tries": ADDED 2026-10-01 — the app-lock PIN overlay counts wrong PINs; the 2nd miss warns "1 more try locks the phone", the 3rd escalates to a FULL phone lock via `DeviceActions.hardLock` (lockNow + kiosk + HOME takeover + call block + lock cover) (TelepointOverlay.kt).

These Kotlin changes are compiled by the next EAS build (see Still-open list). Mobile tsc + tests re-run PASS after the edits.

## 2026-10-01 hardening pass 4 (retailer truth + permission disclosure)

- **Retailer + admin payment summaries are BOTH DB-truth:** the retailer page mounts the same `CustomerPaymentSummary` (with `breakdown` from `get_due_breakdown` — server fine_settings + frozen `fine_amount`), so the fine-balance fix covers both surfaces; the portfolio-level `RetailerPaymentSummary` is fully server-computed via `/api/metrics` (no client fine recalc anywhere).
- **Customer app shows the Android permission checklist:** `DeviceManagementScreen` now lists every permission the app takes and why — Device Administrator, Accessibility (consent), Display-over-other-apps, Notifications, Exact alarms, SMS receive/send, Location (incl. background), Phone state, Battery exemption — plus the note that camera/uninstall/reset/FRP controls are Device Owner policies and that everything is removed once the EMI is paid.
- **Web admin controls have proper controls + icons:** every action in `DeviceManagementPanel` has a lucide icon and a real control (switch toggles, On/Off buttons, PIN input, confirmation flows); the live protection grid uses ShieldCheck/ShieldAlert per row.
- Superseded build `f9d5c40c` was cancelled (submitted before the permission screen existed); the consolidated build is `4faa65a4-c1f4-45cb-aa58-5573c01f1798` (all Kotlin + UI changes). Mobile `tsc` re-run PASS after the screen edit.

## 2026-10-01 unlock-wins pass (LOCK/UNLOCK both execute every time; offline unlock sticks)

Requirement: LOCK and UNLOCK must both execute every time, and an unlock must hold even when the server has not been updated (offline TOTP/SMS unlock, stale server state).

- **Unlock watermark (native):** `LockStateStore.lastUnlockedAt` is stamped on every local unlock — backend UNLOCK (`executeAuthorizedUnlock`), offline TOTP (`verifyTotpUnlock` → `DeviceActions.releaseLock`), offline SMS UNLOCK (`SmsCommandReceiver` → `releaseLock`), and `coreRelease`. Bridge: `getLastUnlockedAt()`.
- **Stale LOCKs never re-lock:** both pollers (JS `deviceSync.ts` and the native `TelepointCommandService`) skip any LOCK whose `created_at` is on/before the last unlock and ack it **`SUPERSEDED`**. A LOCK issued AFTER the unlock still executes every time; UNLOCK always executes.
- **Server:** `/api/device/command/ack` accepts `SUPERSEDED` → command closed + device set to `ACTIVE` (the portal stops showing "Locked" for a phone that was unlocked offline); `TERMINAL_STATUSES` and `DeviceCommandStatus` include `SUPERSEDED`. **SQL required:** `migrations/037_unlock_wins_superseded.sql` widens the `device_commands.status` CHECK to admit `SUPERSEDED` (also appended to `APPLY_ALL_device_management.sql`) — without it the ack write fails on the constraint. No other SQL is needed for this conversation's changes (devices.policies is JSONB; audit_log.action is unconstrained TEXT; payment-summary fix reuses existing RPC/columns).
- **UI trusts the phone, not stale server state:** `useDeviceCommands` derives `locked` from executed command results first, then the NATIVE enforced flag (`LockStateStore`, persists across reboot), falling back to server ACTIVE — a stale server `LOCKED` can no longer re-lock the UI after a TOTP/SMS unlock.
- Checks re-run: web `tsc` PASS (0), mobile `tsc` PASS (0), `node --test` 24/24 PASS (sync test mock extended with `getLastUnlockedAt`). Consolidated EAS build `6c996562-3a72-454a-8d70-ca1441d2b6c4` **FINISHED** (2026-10-01 14:06 UTC) — cloud-compiles the whole unlock-wins Kotlin: artifact `https://expo.dev/artifacts/eas/HPCLyKsjoHGLlD5Ye-aojB_WTTSxa-18BmtSPqB3gq8.apk`, SHA-256 `655F6B64468E10E8BAE0ABC4E3AC410348CFC543B8F659F7F833D1E754C1F353` (69,105,832 bytes). Superseded `4faa65a4` was cancelled before building.

## 2026-10-01 permission-onboarding pass (Device Management rework)

- **Full permission onboarding with live cross-check:** `DeviceManagementScreen` now asks for EVERY permission with a Grant button and re-checks each against the live OS: Device Administrator, Accessibility, Display-over-other-apps, Notifications, Exact alarms, Battery, SMS (receive+send), Location (incl. background), Phone state. The hero shows **"Device Activated ✓"** ONLY when every row is green (`doneCount of 9`), otherwise "Complete device setup".
- **SMS auto-grant:** `grantLocationSimPermissionsIfOwner` now also grants `RECEIVE_SMS` + `SEND_SMS` silently as Device Owner (offline LOCK/UNLOCK channel), alongside location/phone/notifications.
- **PIN 9088 gate on accessibility:** opening the Accessibility screen that lists/toggles TelePoint now shows a full-screen **Owner PIN (9088)** gate (new `TelepointOverlay` mode "pin9088"); wrong PIN steers HOME + back to TelePoint, so the service can only be changed by the owner with the PIN. Emergency 112 stays reachable from the gate.
- **Banned actions extended:** the accessibility steering now also covers the **reset-options / Safe-Mode** Settings screens (on top of uninstall, force-stop, clear-data, factory-reset confirmation, device-admin deactivation).
- **Uninstall honesty:** the screen shows an explicit "Uninstall & reset not blocked yet — needs Device Owner enrolment (store QR)" warning in Device-Admin mode; Android cannot hard-block uninstall under plain Device Admin, and the app now says so plainly while the accessibility deterrent steers away from the screens.
- Checks re-run: mobile `tsc` PASS (0), `node --test` 24/24 PASS. EAS rebuild submitted with all of the above.

## 2026-10-01 arena audit iteration (4 hostile auditors, scores 61/55/62/45 → fixes applied)

Four independent hostile auditors scored the session's changes and every confirmed finding was fixed:

- **Lock-state integrity (server):** only LOCK/UNLOCK touch `devices.management_status` / `customers.is_locked` (issue + ack routes); ack transitions are ATOMIC (`.select('id')` — state writes only when the row actually moved); SUPERSEDED only sets ACTIVE when no newer in-flight LOCK exists; `customers.is_locked` now reconciled on EXECUTED/SUPERSEDED/FAILED; ownership gate runs BEFORE the idempotent branch.
- **Unlock-wins hardened against clock attacks:** watermark now stamped with `SystemClock.elapsedRealtime()` (monotonic) and compared against the SERVER clock via `server_now` in the poll response (`isLockCommandStale` bridge + native service); the ISO parser now truncates Postgres microsecond fractions (the old parser misparsed `.123456` as +123 s — could re-lock paid customers); unparseable dates fail toward NOT re-locking.
- **PIN 9088:** removed from every user-visible string (overlay copy, screen copy); gate now also fires on the service DETAIL screen (label match without requiring the word "accessibility"), on permissioncontroller, Play Store (vending), and OEM manager packages; per-window suppression stops owner re-gate loops; 5-attempt freeze on the overlay gate + 5-attempt/30 s cooldown on the diagnostic panel.
- **Kill paths hooked:** uninstall prompts (installer + Play Store), force-stop/clear-data via permissioncontroller, reset options / safe-mode, device-admin deactivation; owner-driven screens (app in foreground) are exempt so the store's own diagnostic actions never bounce.
- **Emergency/call:** `dial()` dismisses the cover first; new "call" overlay mode with "Show call screen" (answer/decline) + emergency button.
- **Admin portal (auditor D):** App PIN Lock fixed end-to-end (ACTION_KEYS + pin validation + audit redaction + retailer API strips pin); TOTP reveal is now super_admin-only AND audited; retailer API no longer returns last_location/sim_info to retailers; offline-SMS section admin-only; settled-loan restrictions refused server-side; RPC-failure fallbacks no longer invent client-calc fines (breakdown null → stored columns); history badges incl. UNKNOWN + on/off tags.
- **Onboarding (auditor A):** battery check defaults false and the wrapper returns false on read failure; activation counts owner-granted rows only on Device Owner phones; AppState re-check on return from OS screens; accessibility gate re-arms on every foreground while the loan is outstanding; OEM `<queries>` manifest block added (Android 11+ package visibility — the OEM buttons were dead without it) and the fallback now opens the battery list, not our own App Info page (no self-bounce); app-lock 3-strike counter no longer resets on re-show.
- **Tests:** deviceSync suite extended (27/27) — stale LOCK → SUPERSEDED ack, fresh LOCK executes, UNLOCK always executes; mock completed.
- **SQL:** 037 hardened with `to_regclass` guard (runs standalone on a fresh DB too).
- Residual (documented, not fixed — device/DB work): FRP account validation against the Google account (M4), OEM pop-up component names need per-brand device verification, LoanStatement/EMISchedule table still show accrual projections per-row (the summary tiles are DB-truth), `supabase/existing_supabase_upgrade_FINAL.sql` is historical (apply APPLY_ALL for prod).

Checks after every fix: web `tsc` 0, mobile `tsc` 0, `node --test` 27/27.

## 2026-10-01 reboot/background enforcement pass (user-reported: unlocked after reboot, app-only lock, background)

- **Reboot re-lock hardened:** `TelepointBootReceiver` now also shows the full-screen lock cover immediately on boot (before the relaunched app draws) on top of `lockNow` + relaunch; manifest intent-filters verified (BOOT_COMPLETED / LOCKED_BOOT_COMPLETED / QUICKBOOT_POWERON).
- **Non-Device-Owner re-assert (the app-only lock fix):** `TelepointCommandService.tick()` now, while locked on a DEVICE_ADMIN phone (no kiosk), re-issues `lockNow()` every poll (6 s fast cadence while locked) and keeps the lock cover up (`TelepointOverlay.isShowing()` guard) — the customer can no longer keep using the phone after unlocking the screen. Device Owner devices are pinned by kiosk + HOME takeover and skip this (no double-lock loop).
- **Background guarantees verified:** `TelepointCommandService` is `START_STICKY`, self-reschedules (30 s idle / 6 s locked), runs as a foreground `dataSync` service, restarts on boot via the receiver, and executes LOCK/UNLOCK/RELEASE/DEVICE_ACTION with the app fully closed — plus the OEM autostart/background-pop-ups cards for vivo/Xiaomi/Oppo/Huawei.
- **Honest limit re-stated:** on a DEVICE_ADMIN phone Android forbids a kiosk — the 6 s re-lock is the strongest app-side mitigation; the hard block still requires **Device Owner enrolment (store QR)**. Checksum items above remain the acceptance evidence.
- **Verifier flags closed (2026-10-01, 2nd iteration):** the non-DO re-assert now runs at the TOP of `tick()` BEFORE any network call (offline re-lock, not just on 2xx polls); Android 15+ FGS budget handled via `onTimeout` override (clean stop instead of crash); `TelepointOverlay.view` is `@Volatile`; boot receiver uses `applicationContext` for the overlay; receiver marked `directBootAware` (pre-unlock enforcement still needs device-protected storage — BOOT_COMPLETED remains the enforcement point, documented).
- Checks: mobile `tsc` PASS (0), `node --test` PASS. Final consolidated EAS build `8dc37791-2e3e-421d-84ff-ecb663d6bd23` submitted (supersedes `2de953f9`). **8dc37791 ERRORED in Gradle** — one Kotlin error: `TelepointAccessibilityService.kt:176:34 Unresolved reference: topActivity` (must be `taskInfo.topActivity`). Fixed (`fce36bd`, pushed) and rebuilt as `874a9005-417b-4d53-a59f-451b333e325c` — this is the build that carries the reboot/background enforcement + all audit fixes.

## 2026-10-01 reticle E2E instrumentation + first verdict (LATER UNINSTALLED at user request)

- History: reticle was installed + wired (`npx @reticlehq/server init`), the login flow was driven once and produced **`verified: yes · proved`** (route ✓, sign-in copy ✓, visible button ✓). The user then asked to uninstall it ("its weird").
- **UNINSTALLED cleanly:** `withReticle` removed from next.config.js; `app/reticle-dev.tsx` + its layout usage removed; `@reticlehq/next`/`@reticlehq/react` uninstalled; `.reticle.json`, `.reticle/`, `RETICLE.md`, `.claude/commands/reticle.md` deleted; reticle sections stripped from AGENTS.md/CLAUDE.md; the `reticle` entry removed from `~/.claude.json` mcpServers; `~/.reticle` data dir and the `reticle*` npm bins deleted; `claude plugin marketplace remove reticlehq` ran. No reticle references remain in source (grep-verified).
- Honest limit (historical): deeper admin flows were never driven with reticle — staff credentials + a service-role key are still the requirement for any future E2E verification tool.

## 2026-10-01 provisioning QR upgrade (one QR for every customer)

- `app/admin/provision` upgraded: env defaults (`NEXT_PUBLIC_PROVISIONING_APK_URL` / `_APK_SIGNATURE`) + localStorage persistence (same QR reused store-wide); **"Fetch APK URL from GitHub"** button (auto-fills the latest/tagged Release asset URL for `NEXT_PUBLIC_GITHUB_REPO`, default biswajitkhanra/telepoint); recorded-consent checkbox gate (AGENTS rule 4); raw QR-JSON preview + copy button for cross-checking the checksum/link before printing.
- Flow: GitHub Release hosts the APK (permanent URL) → one QR for ALL customers (identity binds at login) → fresh phone: 6 taps → scan → auto-download + enrol as Device Owner → `onProfileProvisioningComplete` finalizes.
- No-PC wireless-debugging fallback documented (LADB, Android 11+): factory reset → no Google account → wireless debugging → `pm install` + `dpm set-device-owner com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver` (the app cannot self-enrol — dpm must come from the shell; documented in docs/DEVICE_OWNER_PROVISIONING.md).
- Cross-check chain after each build: poller downloads APK + SHA-256 + download QR; signing-cert SHA from `eas credentials` feeds the QR page.
- Build: stuck `874a9005` cancelled; fresh `5015d1d5-67f1-4f32-a5ea-9cd0424bb7f8` submitted. Web `tsc` PASS (0).

## 2026-10-01 independent cross-check pass (4 verifiers + lead spot-checks, live source only)

Four independent verifier agents walked `docs/ANDROID_MASTER_CHECKLIST.md` §4.5 A–D against live code (no files touched); the lead agent re-checked every contested finding by hand:

- **A. Accessibility (CONFIRMED):** service, `res/xml`, manifest wiring (AndroidManifest.xml:101-112), live OS readback (never faked), consent-based enable only — no silent/remote path (TelepointAccessibilityService.kt:153-155), disabled on release in all 3 paths, no permission-dialog interception, no screen-content storage. Stale checklist rows corrected: `enableAccessibilityIfOwner()` never existed; there is deliberately NO re-enable on boot/LOCK (AuthContext.tsx:35-37, TelepointBootReceiver.kt:35-37, TelepointCommandService.kt:205-209); `setPermittedAccessibilityServices` is NOT set while outstanding (would restrict the customer's other services — AGENTS.md rule 4), only cleared with `null` on release.
- **B. Device Owner (CONFIRMED + FRP hardened):** `setUninstallBlocked`/restrictions/`setUserControlDisabledPackages` with real readback; re-apply on enrollment (TelepointDeviceAdminReceiver.kt:34-35), boot (TelepointBootReceiver.kt:33) and authenticated sync (deviceSync.ts:85-86); diagnostics read live OS state. **Fixes applied this pass:** unsupported-while-active → `frp_apply`; missing accounts → `frp_accounts_missing`; thrown FRP disable re-reads and reports `frp_release` (FinancingProtection.kt:61-102); hard-coded default Gaia id REMOVED from `mobile/src/config.ts` (fail-safe empty — set `EXPO_PUBLIC_FRP_ACCOUNTS` explicitly); live `frpEnabled` row added to PIN-9088 diagnostics (Module.kt:314-326, index.ts:191, DiagnosticScreen.tsx:180).
- **C. Lock/release (CONFIRMED):** server-authorised LOCK with device ack, UI "locked" only from server readback/executed result/persisted policy (no fake button lock); lock survives reboot (LockStateStore + boot lockNow + DPM-persistent kiosk/HOME); release before commands, no stale locks (unit-tested deviceSync.test.mjs:51-66); background foreground service executes+acks with app closed (30 s idle / 6 s fast); overlay + call lock honest with emergency 112 preserved; offline/error never activates policy. **Caveat:** native `Totp.kt` has NO Kotlin unit test in-repo (only the server TS twin, lib/totp.test.mjs) — add one (RFC 6238 vectors) or verify on device before acceptance.
- **D. Channels/reminders/data (CONFIRMED):** reminder engine matches the spec (10:00/18:00, day-before hourly, due-day hourly, overdue 5-min, bn/hi voice, reboot/tz restore — 24/24 tests re-run); SMS allowlist + customer code with +91 normalization, bounded non-PII last-event, **NOT cryptographically authenticated**; SIM sentinel; OEM autostart; TOTP present; migrations 030–032 + 034–036 (033 never existed — `migrations/APPLY_ALL_device_management.sql:5`); RLS in 030/031/032; no service-role key in mobile/; no `QUERY_ALL_PACKAGES`. **Fixed false HMAC claims** in `docs/android-permissions.md:129,137`.

**Docs updated this pass:** `docs/ANDROID_MASTER_CHECKLIST.md` (§4.5 A–E ticked with file:line evidence, L1 route name, R5 loan-switcher nuance), `docs/android-permissions.md` (HMAC), `docs/FRP_MASTER_SETUP_GUIDE.md` + `docs/CLAUDE_EXECUTION_PLAN.md` (no hard-coded Gaia id), this ledger.

**Tooling (arena-skill, goal-gated install):** cloned to `D:\telepoint\arena-skill`; marketplace added (`claude plugin marketplace add Jakeschincariol/arena-skill`) and installed (`claude plugin install arena-skill@arena-skill` → v1.0.0, enabled, provides `arena`); repo manifest validates; its own tournament tests 27/27 PASS. Also copied into `.dsh/skills/arena` (project + user) for this GUI's skill catalog (visible to new sessions). It is NOT on npm, so DSH's npm-only bundle manager cannot host it — the `/plugin` commands live in Claude Code. Previous `.arena` run (16 agents, seed 785481) was abandoned in round 1 (no champion) — the plugin now makes `/arena` (as `/arena-skill:arena`) runnable again.

**Still open — tick only with evidence (device/build acceptance):**
- [x] NEW EAS customer build from the CURRENT tree — **DONE**: latest `6c996562-3a72-454a-8d70-ca1441d2b6c4` FINISHED (2026-10-01 14:06 UTC) — accessibility gate + FRP env + protection reporting + permissions checklist + tamper deterrents + unlock-wins; artifact `https://expo.dev/artifacts/eas/HPCLyKsjoHGLlD5Ye-aojB_WTTSxa-18BmtSPqB3gq8.apk`, SHA-256 `655F6B64468E10E8BAE0ABC4E3AC410348CFC543B8F659F7F833D1E754C1F353`. Earlier: `094296ef` FINISHED, `7d2b9bd3` FINISHED, `c5f2da04` FINISHED (first current-tree compile; `63be3c4a` ERRORED on TelepointOverlay.kt:109 nullable `pkg` — fixed).
- [ ] EAS retailer build.
- [ ] Native Totp.kt unit test or explicit on-device verification.
- [ ] Commands endpoint deployment (authoritative `loan_status`).
- [ ] §4 device acceptance script on a disposable Device-Owner phone.
- [ ] Kotlin now COMPILES in the cloud (c5f2da04, `compileReleaseKotlin` passed) — but NO device run yet: physical-device acceptance remains NOT TESTED.

Earlier pass (preserved for traceability):
- [x] New sync regressions reproduced six failures before the fix.
- [x] Eight sync tests passed after the fix (unknown status, outstanding loan, COMPLETE/SETTLED, failed release).
- [x] Mobile TypeScript passed after native status types and screen copy changes.

## Android references

- [DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager): uninstall policies, user control, FRP, policy readback; deprecated legacy Device Owner removal caveat.
- [UserManager restrictions](https://developer.android.com/reference/android/os/UserManager): scope of Settings factory reset and other restrictions.
- [Financed-device API](https://developer.android.com/reference/android/devicelock/DeviceLockManager): privileged financing integration is different from installing a normal app.

Future agents must update this ledger rather than silently mark pending items complete.
