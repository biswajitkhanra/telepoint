# TelePoint — Requirements Coverage (Asked vs Have)

Every feature requested across the brief and follow-ups, with honest status.

**Legend:** ✅ done + verified here (logic/tsc/tests) · 🟡 code complete, needs an EAS build + Device-Owner phone to verify · ⛔ not implemented · 📄 documented Android limitation (cannot be done, not faked).

> Reminder: nothing native has been run on a device or through an EAS build in this workspace. 🟡 means "written and type-checks," not "proven on hardware." See `android-final-verification.md`.

## Apps & auth
| # | Requirement | Status |
|---|---|---|
| 1 | Two separate apps (customer `com.telepoint.customer`, retailer `com.telepoint.retailer`) | ✅ |
| 2 | Customer app shows only customer login; retailer only staff; no role selector in single-purpose builds | ✅ |
| 3 | Retailer login **stays logged in** across app kill / reboot | 🟡 (root-load + cookie flush + login redirect; needs build) |
| 4 | Customer session persists; restores offline | ✅ |
| 5 | **No logout / no account switch until EMI fully paid** | ✅ (ProfileScreen gate) |

## Reminder engine
| # | Requirement | Status |
|---|---|---|
| 6 | 5→2 days before: **10:00 AM & 6:00 PM** | ✅ (unit-tested) |
| 7 | **Day-before + due day: every hour** | ✅ (unit-tested) |
| 8 | **Overdue: every 5 minutes**, until paid | ✅ logic / 🟡 firing |
| 9 | Overdue reminder can be turned **off from the portal** | ✅ |
| 10 | **Voice on the due day only**, Bengali/Hindi, per customer | ✅ logic / 🟡 TTS on device |
| 11 | Shows **customer photo + amount + due date + message**, app open or closed | ✅ logic / 🟡 on device |
| 12 | Works **offline**, **no server request** for automatic reminders | ✅ (on-device AlarmManager) |
| 13 | Reminder schedule stored on the device; survives reboot / timezone change | 🟡 (boot + tz receiver) |
| 14 | **Manual "Send EMI Reminder"** from portal (with/without voice, language) | ✅ (server-driven) |
| 15 | Full-screen reminder | 🟡 partial (heads-up notification + photo + voice; not a full-screen-intent takeover) |

## Lock & collateral protection (Device Owner)
| # | Requirement | Status |
|---|---|---|
| 16 | Lock / Unlock, **server-authorised + device-acknowledged** (no fake "locked") | ✅ logic / 🟡 enforce |
| 17 | Locked EMI screen with photo/name/amount/due/retailer/contact; **stays on screen** | 🟡 (kiosk; per-poll re-lock removed) |
| 18 | Lock **survives reboot** | 🟡 (boot receiver + persisted flag) |
| 19 | **Uninstall blocked** while unpaid | 🟡 (Device Owner) |
| 20 | **Factory reset blocked** (Settings) | 🟡 (`DISALLOW_FACTORY_RESET`) |
| 21 | **Can't reboot to Safe Mode** | 🟡 (`DISALLOW_SAFE_BOOT`) |
| 22 | **FRP lock** (anti-format; account biswajit.khanra82@gmail.com) | 🟡 — mechanism done; needs the account's **numeric Gaia id** (not the email) |
| 23 | Everything **released automatically on full loan closure** | ✅ logic / 🟡 (`releaseManagedRestrictions` on COMPLETE/SETTLED) |

## Advanced device actions (Bajaj panel)
| # | Requirement | Status |
|---|---|---|
| 24 | Camera Lock/Unlock | 🟡 (`setCameraDisabled`) |
| 25 | Bluetooth / USB / Outgoing-call / Wallpaper-change locks | 🟡 (user restrictions, DO) |
| 26 | Wi-Fi **config** lock | 🟡 (`DISALLOW_CONFIG_WIFI`) |
| 27 | **Wi-Fi power ON/OFF** (real) | 🟡 (`setWifiEnabled`, DO) |
| 28 | Airplane mode **lock** | 🟡 |
| 29 | Airplane **power ON/OFF** | 📄 attempt-only; Android blocks it even for DO (reports failure; not faked) |
| 30 | **Reboot** | 🟡 (`dpm.reboot`, DO) |
| 31 | **App Hide/Unhide** (EMI-only) | 🟡 (hide all user apps except TelePoint) |
| 32 | **Device Location** (fetch + show + map) | 🟡 (last-known; reported to portal) |
| 33 | **SIM Information** (carrier/number/slot) | 🟡 |
| 34 | **Location + SIM Tracking** on/off | 🟡 (reports at sync cadence, not a GPS stream) |
| 35 | Actions show real state; unsupported = "Requires Device Owner", never faked | ✅ |
| 36 | "MIUI permission" row (from screenshot) | ⛔ not built (OEM-specific autostart; document per-OEM) |
| 37 | App **Lock** (suspend, distinct from Hide) | ⛔ not built (App Hide covers the EMI-only intent) |

## Control channels
| # | Requirement | Status |
|---|---|---|
| 38 | Online control via admin/retailer portal | ✅ |
| 39 | **Offline SMS control** from `7003617029` / `7003617074` only, any number format | ✅ logic / 🟡 on device |
| 40 | SMS grammar: `LOCK/UNLOCK/REBOOT <code>`, `<FEATURE> ON/OFF <code>`, `HIDE`, `TRACK` | ✅ |
| 41 | Admin panel = collapsed "Device & App Lock" button, expands to all options | ✅ |

## Provisioning (Device Owner) — no computer
| # | Requirement | Status |
|---|---|---|
| 42 | **No-computer provisioning** (QR at setup) | ✅ (portal `/admin/provision` generates QR + CLI generator) |
| 43 | Auto-provision Device Owner from inside the app via Accessibility / wireless debugging | ⛔ **impossible + disallowed** — an app cannot self-grant Device Owner; QR/zero-touch is the no-computer path |
| 44 | Wireless-debugging provisioning (needs a PC) | ✅ (`scripts/provision-device-owner.ps1`, fallback) |

## Security, data, hygiene
| # | Requirement | Status |
|---|---|---|
| 45 | RLS on all new tables; ownership resolved server-side | ✅ (review) |
| 46 | No service-role key in the app | ✅ |
| 47 | Audit logging (commands, config, reminders, actions) | ✅ |
| 48 | DB migrations 030–035, idempotent | ✅ (not applied — you apply) |
| 49 | Permissions audited; no Accessibility; no QUERY_ALL_PACKAGES | ✅ (see `android-permissions.md`) |
| 50 | Command security: expiry, ownership, device/install match, newest-wins | ✅ (unit-tested) |

## Not testable here (need EAS build + Device-Owner phone)
APK builds, on-device lock/unlock enforcement, reboot persistence, uninstall/factory-reset/safe-boot/FRP, exact alarms firing while closed, TTS audio, notification permission prompt, SMS receipt + action execution, Wi-Fi power, location/SIM fetch, tracking, QR provisioning, and the full-release-on-closure on a real device. Every one is written and type-checks; run the on-device checklist in `telepoint-device-management-guide.md` §9.
