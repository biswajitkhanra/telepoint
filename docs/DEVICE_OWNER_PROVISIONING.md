# TelePoint — EMI Lock & Uninstall Protection

## NO-COMPUTER path (what your store staff actually do) — QR at setup

> The real, no-computer method is **Device Owner via a provisioning QR**.
> Device Owner is the mode that gives the full Bajaj-style lock (can't exit with
> a PIN, can't uninstall, factory-reset/safe-boot blocked, FRP, survives reboot)
> — and it is set with **no PC touching the phone**.
>
> **Accessibility deterrent (owner-authorised):** on top of Device Owner, the
> TelePoint accessibility service is enabled on the financed phone as an extra
> layer that steers away from the uninstall / force-stop / clear-data /
> factory-reset screens while the EMI is outstanding. It does **not** replace
> Device Owner (which is the guaranteed block), is off in Safe Mode, and is turned
> off automatically once the loan is COMPLETE/SETTLED. See the "Enable the
> accessibility deterrent" step below.

**One-time setup (admin):**
1. Host the customer APK at a public `https://` URL.
2. Get the signing cert SHA-256 (`eas credentials` → Android → SHA-256 fingerprint).
3. Generate the QR — **no computer needed**: open the admin portal → **/admin/provision**,
   paste the APK URL + SHA-256 (+ optional store Wi-Fi), tap **Generate QR**.
   (CLI alternative: `docs/device-owner-qr/generate-qr.mjs`.)

**Per phone (store staff, no PC):**
1. **Factory-reset** the phone. Do **not** add any Google account.
2. At the first setup-wizard screen, **tap the same spot 6 times** → the QR scanner opens.
3. **Scan the QR.** The phone joins Wi-Fi, downloads TelePoint, and enrols it as
   **Device Owner** automatically.
4. **Enable the accessibility deterrent (customer-consented).** Open TelePoint →
   Profile → tap the version footer **7×** → enter PIN **9088** → tap
   **Open settings** on the "Accessibility protection" row → turn on **TelePoint
   device protection** in **Settings → Accessibility**. Re-open the panel and
   confirm the row reads **on** (green). The app never enables it remotely or
   silently; this is done in front of the customer at the store.
5. Hand over the phone. From then on the admin/retailer portal (and the two
   authorised SMS numbers) control it; everything — Device Owner **and** the
   accessibility deterrent — releases automatically when the EMI is fully paid.

No ADB, no cable, no PC touches the phone. The only computer step is generating
the QR once — and even that runs in the browser on any phone/tablet.

---

## Fallback — ADB over Wireless debugging (needs a PC, single device)

If you must provision one device from a PC (e.g. dev/testing), run
`scripts/provision-device-owner.ps1` (Windows PowerShell). It automates the
wireless-debugging pair → connect → set-device-owner → verify flow. This still
requires a PC, so QR above is preferred for the store.

---

# Hard EMI Lock (Device Owner) Provisioning

This is how a financed phone gets the **real, Bajaj/Flipkart-style lock**: the
device stays locked and the customer **cannot** unlock it until the EMI is paid,
the app cannot be uninstalled, and the lock survives reboot. This is only
possible when the TelePoint app is the Android **Device Owner**, which — by
Android's security design — can only be set on a **fresh or factory-reset phone
with no Google/user account added yet**. That is why device financiers enrol the
phone at the store before handing it over. Do this once, at the counter.

If a phone is *not* enrolled as Device Owner, the app still works but only as a
**soft lock**: it locks the screen and shows the EMI screen, but the customer
can unlock with their own PIN. The admin panel shows which type each phone is
("Lock type: Hard lock (Device Owner)" vs "Soft lock").

---

## Method A — ADB at the store (no hosting required; recommended)

Prerequisites: a store PC with `adb` (Android platform-tools) and a USB cable.

1. **Factory reset** the new phone (or use it brand-new). In the setup wizard,
   **do NOT add any Google account or other user** — skip account sign-in.
   Finish setup to the home screen.
2. On the phone: Settings → About phone → tap **Build number** 7 times to enable
   Developer options. Then Settings → System → Developer options → enable
   **USB debugging**.
3. Connect the phone to the store PC. Approve the USB-debugging prompt.
4. Install the customer APK (the one you built with the `customer` EAS profile):
   ```
   adb install telepoint-customer.apk
   ```
5. Set TelePoint as Device Owner:
   ```
   adb shell dpm set-device-owner com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver
   ```
   Expected output: `Success: Device owner set to package com.telepoint.customer`.
   - If it fails with *"Not allowed to set the device owner because there are
     already some accounts on the device"*, an account was added during setup —
     factory reset and repeat, skipping all sign-in.
6. **Enable the accessibility deterrent (customer-consented):** TelePoint →
   Profile → tap the version footer **7×** → PIN **9088** → **Open settings** on
   the "Accessibility protection" row → turn on **TelePoint device protection** in
   Settings → Accessibility. Confirm the row reads **on**. (No silent/remote
   enable; the owner does this explicitly.)
7. Hand the phone to the customer. They log in with Aadhaar/mobile as usual. The
   app auto-registers; the admin panel will now show **Hard lock (Device Owner)**.

> The Device Owner component for each build variant:
> - Customer app: `com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver`

---

## Method B — QR-code provisioning (scale / no cable)

On a fresh phone, tap the setup-wizard welcome screen **6 times** to open the QR
scanner, then scan a provisioning QR whose JSON contains at least:

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME":
    "com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "<base64-url APK signing checksum>",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://<host>/telepoint-customer.apk",
  "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true
}
```

This requires hosting the signed APK at a public URL and computing its checksum.
Use Method A until QR hosting is set up.

---

## What the lock enforces (Device Owner)

When an admin issues **LOCK** and the phone is Device Owner, the app:
- enters **kiosk / lock-task** mode — home, recents and back are disabled, the
  customer cannot leave the TelePoint lock screen;
- becomes the **HOME launcher** while locked, so a reboot lands on the lock
  screen (a `BOOT_COMPLETED` receiver also re-asserts the lock);
- **blocks uninstall** of the app and blocks **factory reset / safe boot / adding
  users**, so the lock cannot be trivially wiped;
- persists the locked state on the device, so it resumes after an app kill.

Only an authorised **admin UNLOCK** (after the EMI is paid) releases it — there
is **no customer-facing unlock** anywhere in the app.

## Releasing a phone permanently (EMI fully paid / warranty return)

After the loan is COMPLETE/SETTLED, unlock from the admin panel. To fully remove
management (so the device is a normal personal phone again), factory reset the
device, or add a one-tap "release" that calls `clearDeviceOwnerApp` — ask the
dev team to enable this if you want it in-app.
