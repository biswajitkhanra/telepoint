# TelePoint Device Management — Complete Guide

**Audience:** TelePoint operators (admin + retailers) and the engineer who builds/provisions the apps.
**Scope:** everything built for the EMI device-financing control system — features, setup, day-to-day use (online + offline SMS), and the legal release model.
**Companion docs:** `docs/android-implementation-audit.md` (pre-work audit), `docs/android-final-verification.md` (per-item PASS/PARTIAL/NOT-TESTED), `docs/frp-and-sms-provisioning-research.md` (provisioning + FRP details), `docs/DEVICE_OWNER_PROVISIONING.md` (QR provisioning).

> **Status note (honest):** all native Android behaviour compiles and is written against documented APIs, but it has **not been run on a physical device or through an EAS build in this workspace**. Treat the on-device items as "ready to build & test," not "verified." See `android-final-verification.md`.

---

## 1. Legal / policy model — read this first

TelePoint finances a phone on EMI. **The phone is the collateral, and TelePoint (the financer) is the device's Device Owner for the duration of the loan** — exactly the model banks/NBFCs like Bajaj use. This is legitimate and enforceable **only** because:

1. **Consent at purchase.** The customer signs the financing agreement and the in-app consent that authorises EMI device management. The device is enrolled at the store, on a device sold under that agreement.
2. **Proportionate control.** While the EMI is unpaid, TelePoint can lock the device, restrict features, and prevent removal/reset — to protect the collateral, not to harm the customer. The locked screen always shows the amount due and how to pay/contact the store.
3. **Automatic, total release on closure.** The moment the loan is **COMPLETE** (fully paid) or **SETTLED**, the app **releases everything** — lock, uninstall block, factory-reset block, safe-boot block, FRP, all feature restrictions, hidden apps, and tracking — and the customer regains a normal, unmanaged phone. This is enforced in code (`releaseManagedRestrictions`), not left to manual action.

**Do not deploy this on a device the customer did not finance under an agreement, or without their consent.** Only documented Android APIs are used — no root, no exploits, no fake system UI, no bypasses. The customer app also declares the owner-authorized accessibility service, which is **required** to prevent uninstall/reset as an additional deterrent layer (steering away from the uninstall/reset/settings screens) on top of Device Owner, which remains the guaranteed block.

---

## 2. What has been built (complete list)

### Apps
- **Customer app** (`com.telepoint.customer`) — native. EMI dashboard, reminders, locked screen, device-management consent + status.
- **Retailer/Admin app** (`com.telepoint.retailer`) — the web portal in a WebView. Login persists across app kill/reboot (loads portal root, flushes cookies).

### Reminder engine (offline, no server calls for automatic reminders)
- Deterministic scheduler (unit-tested): **days −5…−2 at 10:00 & 18:00**, **day-before-due (−1) and due day hourly**, **overdue every 5 minutes**.
- Native exact-alarm engine (AlarmManager) fires while the app is closed; re-schedules on **boot / timezone / time change**.
- **Voice on the due day only** (Android TextToSpeech), **Bengali or Hindi**, per-customer, admin-configurable.
- **Customer photo** shown on reminders + locked screen (cached locally, works offline).
- **Manual "Send EMI Reminder"** from the portal (with/without voice, language).
- Portal toggles: automatic reminders on/off, overdue reminders on/off, due-day voice on/off, language.

### Lock / collateral protection (Device Owner)
- **Lock / Unlock** — server-authorised, device-acknowledged (the portal shows LOCKED only after the phone confirms).
- **Locked screen** stays up (kiosk) showing customer photo, name, amount due, retailer contact, pay/contact actions. Survives reboot.
- **Uninstall block**, **factory-reset block** (Settings), **Safe-Mode block**, **add-user block**.
- **Factory Reset Protection (FRP)** — after any wipe (incl. recovery), the phone demands the configured account.
- **No logout / no account switch** in the customer app until the EMI is paid.

### Advanced device actions (Bajaj-style panel; Device Owner)
Camera lock · Bluetooth lock · Wi-Fi config lock · USB file-transfer lock · Airplane-mode lock · Outgoing-call lock · Wallpaper-change lock · **Wi-Fi power ON/OFF (real)** · Reboot · **App Hide** (EMI-only) · **Device Location** · **SIM Information** · **Location + SIM Tracking**.
Each shows its real state; unavailable ones say "Requires Device Owner" — never faked. (Airplane *power* is an honest attempt that reports failure on modern Android; the reliable control is the airplane *lock*.)

### Control channels
- **Online:** the admin/retailer portal panel (collapsed "Device & App Lock" → expands to all options).
- **Offline SMS:** the two authorised numbers can drive lock/unlock and the actions with no internet on the phone.

### Backend + data
- Migrations `030`–`035`: devices, device_commands (+ payload/voice/language), reminder_settings, extended statuses, device policies snapshot, location + SIM snapshot.
- RLS on all new tables; no service-role key in the app; ownership resolved server-side; audit logging.

---

## 3. Setup (engineer)

### 3.1 Build the apps (EAS — Expo Go is NOT enough)
```bash
cd mobile
npm install                      # installs the two local native modules + deps
eas build -p android --profile customer    # -> com.telepoint.customer
eas build -p android --profile retailer    # -> com.telepoint.retailer
# dev client for on-device debugging of native modules:
eas build -p android --profile development
```

### 3.2 Apply database migrations
Apply `migrations/030` through `migrations/035` to your Supabase project (they are idempotent and additive). **Do this yourself** — the app never touches the DB directly for schema.

### 3.3 Configure build-time secrets (EAS env / eas.json)
| Env var | Purpose | Example |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Backend (publishable anon key only) | — |
| `EXPO_PUBLIC_PORTAL_URL` | Portal for the retailer WebView | `https://telepoint-topaz.vercel.app` |
| `EXPO_PUBLIC_SMS_ALLOWED_SENDERS` | Authorised SMS numbers (comma) | `7003617029,7003617074` (default) |
| `EXPO_PUBLIC_FRP_ACCOUNTS` | FRP account **numeric Gaia id** (see 3.5) | `1078…` |

### 3.4 Provision Device Owner (per phone, at the store)
Device Owner is what makes the strong controls possible. It must be set on a **fresh / factory-reset** device **before any Google account is added**.

**Wireless debugging (no cable):**
1. Factory reset; in setup wizard **skip adding any account**, connect Wi-Fi.
2. Settings → About → tap Build number ×7 → Developer options → **Wireless debugging** → **Pair device with code**.
3. On your computer:
   ```bash
   adb pair <phone-ip>:<pair-port>      # enter the 6-digit code
   adb connect <phone-ip>:<port>
   adb shell dpm set-device-owner com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver
   ```
4. Expect `Success: Device owner set...`. If it fails with "already some accounts on the device," remove all accounts (or re-reset) and retry.
5. Open the app once — it becomes Device Owner and auto-applies protection + grants itself the needed runtime permissions.

QR-code / `afw#setup` provisioning is the scalable alternative — see `docs/DEVICE_OWNER_PROVISIONING.md`.

### 3.5 FRP account (the anti-format account)
⚠️ **Use the account's NUMERIC Google id (Gaia `userId`), NOT the plain email.** The raw email is unreliable and on some phones locks to an *unknown* account after reset. For the target account (`biswajit.khanra82@gmail.com`): sign in as that account, call People API `people/me?personFields=metadata` and read `metadata.sources[].id` (the numeric id), then set `EXPO_PUBLIC_FRP_ACCOUNTS=<that number>`. Requires **Device Owner + Android 11+** and an OEM that implements `FactoryResetProtectionPolicy`. Details + sources in `docs/frp-and-sms-provisioning-research.md` §2.

### 3.6 Permissions the app requests (and why)
`RECEIVE_BOOT_COMPLETED` (re-lock + reschedule after reboot) · `POST_NOTIFICATIONS` (reminders) · `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`/`WAKE_LOCK` (exact reminders) · `RECEIVE_SMS` (offline control) · `ACCESS_FINE/COARSE_LOCATION` (location) · `READ_PHONE_STATE`/`READ_PHONE_NUMBERS` (SIM info) · `CHANGE_WIFI_STATE`/`ACCESS_WIFI_STATE` (Wi-Fi power) · `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (keep background alive). On Device Owner the dangerous runtime permissions are granted silently. The customer app declares the **required** owner-authorized accessibility service (`BIND_ACCESSIBILITY_SERVICE` on the `<service>`, not a `uses-permission`) to prevent uninstall/reset as an additional deterrent; no `QUERY_ALL_PACKAGES`.

---

## 4. Usage — online (admin/retailer portal)

Open a customer → **Device & App Lock** (collapsed by default; tap to expand):
- **Lock / Unlock** (admin only) — shows "Lock requested…" until the phone confirms, then "Locked (confirmed)".
- **EMI Reminders** — toggle automatic/overdue/voice, pick Bengali/Hindi, and **Send EMI Reminder** now (with/without voice).
- **Offline lock by SMS** — shows the exact `LOCK <code>` / `UNLOCK <code>` text to send, with copy buttons.
- **Advanced device actions** (admin) — Camera/Bluetooth/Wi-Fi-config/USB/Airplane/Outgoing-call/Wallpaper locks (red = locked), **Wi-Fi power On/Off**, **App Hide/Show**, **Location + SIM tracking On/Off**, **Reboot**.
- **Device Location** — Fetch → shows lat/lng + map link.
- **SIM Information** — Fetch → shows carrier/number/slot per SIM.

Lock/Unlock and advanced actions are **admin-only**; reminders + Send-reminder are available to the **owning retailer** too.

---

## 5. Usage — offline SMS control (no internet on the phone)

Text the **customer's phone** from an **authorised number only** (`7003617029` or `7003617074`, in any format: `+91…`, `91…`, or bare). Every command ends with the **customer code** (e.g. `TP1233`), which the operator sees on the customer's profile.

| Command | Effect |
|---|---|
| `LOCK TP1233` | Lock the device |
| `UNLOCK TP1233` | Unlock |
| `REBOOT TP1233` | Reboot (Device Owner) |
| `CAMERA OFF TP1233` / `CAMERA ON TP1233` | Disable / enable camera |
| `WIFI OFF TP1233` / `WIFI ON TP1233` | Wi-Fi power off / on |
| `BLUETOOTH OFF TP1233` / `... ON ...` | Restrict / allow Bluetooth |
| `USB OFF TP1233` / `... ON ...` | Restrict / allow USB file transfer |
| `CALLS OFF TP1233` / `... ON ...` | Restrict / allow outgoing calls |
| `WALLPAPER OFF TP1233` / `... ON ...` | Restrict / allow wallpaper change |
| `HIDE ON TP1233` / `HIDE OFF TP1233` | Hide all other apps (EMI-only) / show |
| `TRACK ON TP1233` / `TRACK OFF TP1233` | Enable / disable location+SIM tracking |

Rules: commands are **case-insensitive**; only the two authorised numbers are honoured (matched on the last 10 digits); the code must match the target phone. Location/SIM **reporting** needs internet (it uploads when the phone is next online), but the control commands themselves work offline.

> **Security note:** the number allowlist is the real gate. SMS sender IDs can be spoofed via online gateways and the customer knows their own code, so SMS is a convenience/offline channel, not a cryptographic guarantee. Keep the two numbers private. (An HMAC-signed SMS mode is the available hardening upgrade.)

---

## 6. Reminder behaviour (what the customer sees)
- **5 days before → 2 days before:** a reminder at **10:00 AM** and **6:00 PM**.
- **The day before the due date & the due date:** **every hour**.
- **Due day only:** the reminder also **speaks** (Bengali or Hindi, per the admin setting).
- **After the due date (overdue):** **every 5 minutes** until paid — can be turned off per customer from the portal.
- Each reminder shows the **customer photo, amount, due date and message**, on-screen whether the app is open or not. Automatic reminders make **no server request** — they run entirely on the device.

---

## 7. Release on full loan closure (automatic)
When the customer's status becomes **COMPLETE** or **SETTLED**, the app (on its next sync) calls `releaseManagedRestrictions`, which:
- exits kiosk / lock; clears the lock state,
- clears **uninstall block, factory-reset block, safe-boot block, add-user block, FRP**,
- clears **all feature restrictions** (camera/bluetooth/wifi/usb/airplane/calls/wallpaper),
- **unhides all apps**, and **turns off tracking**,
- and the customer app re-enables **logout / account switching**.

The customer is left with a normal, unmanaged phone. This is the legal end of financer control and it is automatic.

---

## 8. Honest limitations (do not over-promise)
- **All strong controls need Device Owner.** On an ordinary (non-owner) phone, Android permits none of them; the app reports this and does not pretend.
- **Recovery/hardware factory reset cannot be blocked by any app** — FRP is the deterrent (the phone is useless after a wipe without the configured account). Needs Device Owner + Android 11+ + OEM support.
- **Safe Mode** can be fully blocked on Device Owner (`DISALLOW_SAFE_BOOT`); it cannot be "detected then locked" because apps don't run in Safe Mode — blocking entry is the correct control.
- **Airplane power** cannot be toggled by any app on modern Android; only the airplane *lock* is reliable.
- **Exact background reminders** are as reliable as Android/OEM battery management allows; aggressive OEMs (Xiaomi/Oppo/Vivo) may need the app whitelisted (the app prompts for unrestricted battery).
- **Location** is last-known (fast) at the app's sync cadence, not a high-frequency GPS stream; **SIM number** is often null on modern Android even with permission (carrier-dependent).
- **SMS** is an allowlist-gated convenience channel, not cryptographically signed (yet).

---

## 9. On-device test checklist (after an EAS build)
Provision Device Owner, then verify: lock/unlock + confirmed state · reboot persistence · uninstall/factory-reset/safe-boot blocked · FRP after wipe · reminders at 10/18, day-before hourly, due-day hourly + voice, overdue 5-min · manual reminder (voice bn/hi) · each advanced action + live state in the panel · Wi-Fi power on/off · location + SIM fetch · tracking on/off · App Hide/Show · every SMS command from both numbers (and rejection from any other number) · retailer login persists across kill/reboot · **full release when the loan is marked COMPLETE/SETTLED**.
