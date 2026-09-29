# TelePoint — EMI Lock & Uninstall Protection

## No-ADB path (what your store staff actually do)

Your staff cannot use ADB, and that's fine. On a **fresh / factory-reset phone,
before adding any Google account**, they:

1. Install the TelePoint **customer** APK.
2. Open the app → **Device Management** and grant, with the customer present:
   - **Device admin** (enables the EMI screen lock), and
   - **TelePoint EMI Protection** in Accessibility (blocks uninstall while the
     EMI is unpaid), and
   - **Allow unrestricted battery** (keeps it working in the background).

That combination gives a working financing lock **without ADB or Device Owner**:

- **Uninstall is blocked while the EMI is unpaid.** A device-admin app can't be
  uninstalled until admin is turned off, and the accessibility service bounces
  the uninstall / admin-removal screens for this app back until the loan is
  paid. Once the loan is COMPLETE/SETTLED the app clears the flag and removal is
  allowed.
- **Lock** shows the branded EMI screen and re-asserts on each check.
- Because Android won't let a plain app *force* the screen to stay unlocked, the
  customer can still use their PIN on this path (a "soft" lock). For a fully
  un-exitable kiosk that even a PIN can't leave, use the **Device Owner** path
  below (QR at setup — still no ADB).

The lock screen has a **"Turn on Wi-Fi / Data"** button so the customer can
restore connectivity and receive the unlock.

---

## Full kiosk (Device Owner) — strongest, still no ADB (QR at setup)

For the permanent, can't-exit-with-PIN lock, enrol the fresh phone as Device
Owner during the setup wizard by scanning a provisioning **QR** (Method B
below). No ADB needed; it does require hosting the APK once.

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
6. Hand the phone to the customer. They log in with Aadhaar/mobile as usual. The
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
