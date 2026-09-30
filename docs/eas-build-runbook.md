# TelePoint — First EAS Build Runbook (Android)

Step-by-step to get the two APKs built and a phone enrolled. Expo Go is **not**
sufficient — the device-management + reminder + SMS native modules require a real
build. Run these from a machine with Node 18+ and internet.

---

## 0. One-time prerequisites
```bash
npm install -g eas-cli          # Expo Application Services CLI
cd D:\telepoint\telepoint\mobile
npm install                     # pulls deps + the two LOCAL native modules
eas login                       # log in to the Expo account that owns the project
```
The EAS project is already configured (`mobile/app.json` → `extra.eas.projectId`
= `a6c55e9c-1b8f-47b2-8faf-6dfc33c11fef`, owner `biswajitkhas-team`). If that
account isn't yours, run `eas init` to create your own project id.

## 1. Configure build-time env (once)
The `customer` / `retailer` profiles in `mobile/eas.json` already carry the
Supabase + portal env. Set the two device-management values as EAS env (or add
them to the profile `env` block):
```bash
# The FRP account = the NUMERIC Gaia id (NOT the email). Default is baked into
# src/config.ts; override here if you use a different account:
eas env:create --name EXPO_PUBLIC_FRP_ACCOUNTS --value "<21-digit-gaia-id>" --environment production
# Authorised offline-SMS numbers (default 7003617029,7003617074):
eas env:create --name EXPO_PUBLIC_SMS_ALLOWED_SENDERS --value "7003617029,7003617074" --environment production
```

## 2. Build the APKs
```bash
eas build -p android --profile customer     # → com.telepoint.customer
eas build -p android --profile retailer     # → com.telepoint.retailer
```
First build asks to generate a **new Android keystore** — accept (EAS manages it).
Each build prints a URL; download the `.apk` when done (both profiles produce an
APK, `buildType: apk`).

## 3. Get the signing fingerprint (for the provisioning QR)
```bash
eas credentials -p android           # → Customer app → Keystore → copy the SHA-256 fingerprint
```
You'll paste this SHA-256 into the provisioning QR generator.

## 4. Host the customer APK
Upload `telepoint-customer.apk` to any public `https://` location (S3, a static
host, etc.). Note the URL — the QR downloads the APK from there during setup.

## 5. Apply database migrations
Apply `migrations/030` through `migrations/036` to your Supabase project (they are
idempotent + additive). Nothing else touches the DB.

## 6. Enrol a phone as Device Owner — no computer
1. In the portal open **/admin/provision** (on any phone/tablet browser).
2. Paste the **APK URL** + **SHA-256** (+ optional store Wi-Fi) → **Generate QR**.
3. On a **factory-reset** phone (no Google account added), tap the first
   setup-wizard screen **6 times** → the QR scanner opens → **scan** the QR.
4. The phone joins Wi-Fi, downloads TelePoint, and becomes Device Owner. Open the
   app once — it applies protection and grants its own runtime permissions.

(PC fallback for a single device: `scripts/provision-device-owner.ps1` over
wireless debugging — see `docs/DEVICE_OWNER_PROVISIONING.md`.)

## 7. On-device verification (the real test)
Run the checklist in `docs/telepoint-device-management-guide.md` §9. Key items:
lock/unlock + confirmed state · reminders (10:00/18:00, day-before + due-day
hourly, due-day voice, overdue 5-min) · offline SMS from both numbers (and
rejection from any other) · **TOTP offline unlock** (portal "Show code" → type it
on the lock screen with Wi-Fi off) · camera/BT/USB/airplane/outgoing/wallpaper
locks · Wi-Fi power · location + SIM fetch · tracking · App Hide · SIM removal →
lock · reboot · **full release when the loan is marked COMPLETE/SETTLED**.

⚠️ **FRP 72-hour rule:** if the FRP Gmail account was just created / password
changed, do NOT hardware-wipe-test for 72 hours — GMS may reject the login and
brick the test device.

---

## Troubleshooting
- **Build fails on the local modules** → run `npm install` in `mobile/` first;
  the two modules under `mobile/modules/` autolink. Confirm `expo-modules-core`
  resolved.
- **"Expo Go" opens instead of the app** → you launched dev mode; you need the
  installed APK / a dev-client build, not Expo Go.
- **`dpm set-device-owner` fails "accounts already exist"** → the phone has a
  Google/other account; factory-reset and skip account setup, then re-provision.
- **Reminders late on Xiaomi/Oppo/Vivo** → open the OEM autostart screen (panel
  "OEM autostart" action) and allow autostart + unrestricted battery.
- **FRP asks for an unknown account after wipe** → you used the email, not the
  numeric Gaia id. Fix `EXPO_PUBLIC_FRP_ACCOUNTS` and rebuild.
