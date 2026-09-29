# FRP, Wireless-Debugging Provisioning & SMS Command Channel — Research

Scope: TelePoint customer app is enrolled as Android **Device Owner** on financed
devices under a signed EMI agreement (authorized, documented use case). This note
records exact commands, API details, and — importantly — where behaviour is
version- or OEM-specific or not reliably possible.

Admin receiver component used throughout:

```
com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver
```

Last researched: 2026-09-30. Sources are linked inline.

---

## 1) Device Owner provisioning via Wireless Debugging (no USB cable)

### 1.1 What works

`adb` over **wireless debugging** (Android 11 / API 30+) exposes the *identical*
shell used over USB, so `adb shell dpm set-device-owner …` works the same way once
the wireless connection is established. Google's own docs: "You can now use your
device wirelessly similar to how you would with a USB connection."
(https://developer.android.com/tools/adb — "Connect to a device over Wi-Fi")

### 1.2 Exact steps

1. **Factory-reset the phone** (or use brand-new). In the setup wizard, **do NOT
   add any Google account or other user** — skip all sign-in. Finish to home.
2. Enable Developer options: Settings → About phone → tap **Build number** 7×.
3. Settings → System → Developer options → enable **Wireless debugging** (both
   phone and workstation on the same Wi-Fi / LAN).
4. On the phone: Wireless debugging → **Pair device with pairing code**. Note the
   shown **IP:port** and the 6-digit **pairing code** (this pairing port is
   different from the later connect port).
5. On the workstation (platform-tools):
   ```
   adb pair <phone-ip>:<pair-port>
   # when prompted, enter the 6-digit pairing code
   ```
   Expected: `Successfully paired to <ip>:<port> [guid=...]`
6. Connect using the **Wireless debugging** main IP:port shown on the same screen
   (not the pairing port):
   ```
   adb connect <phone-ip>:<connect-port>
   adb devices          # confirm the device is "device", not "unauthorized"
   ```
7. Install the customer APK over the wireless connection, then set Device Owner:
   ```
   adb install telepoint-customer.apk
   adb shell dpm set-device-owner com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver
   ```
   Expected: `Success: Device owner set to package com.telepoint.customer`.

Pairing persists: "You only need to pair your device to your workstation once …
until you explicitly forget it or revoke adb authorizations." So a store bench
can re-connect to the same handset without re-pairing.
(https://developer.android.com/tools/adb)

`dpm` is the Device Policy Manager shell tool; `set-device-owner <pkg>/<receiver>`
is the documented subcommand (identical over USB or Wi-Fi). General ADB device-owner
walkthrough: https://www.manageengine.com/mobile-device-management/help/android_for_work/mdm_device_owner_provisioning_adb.html

### 1.3 Hard preconditions for `dpm set-device-owner` (and exact failures)

`set-device-owner` is deliberately only allowed on a near-pristine device. It
fails if ANY of these are true:

- **An account already exists on the device.** Most common failure. Error:
  `java.lang.IllegalStateException: Not allowed to set the device owner because
  there are already some accounts on the device`
  (https://github.com/googlecodelabs/cosu/issues/15). Google's rationale: a device
  owner set after accounts/data exist would be a takeover/privacy risk, so it is
  blocked. Fix: remove every account (Settings → Passwords & accounts) — a factory
  reset is usually required in practice — and retry before adding any account.
- **A device owner or profile owner already exists.** Error surfaces as
  `Not allowed to set the device owner because there is already a device owner`
  / device-admin already active (https://xdaforums.com/t/device-owner-already-set.3947574/).
- **Not in the post-setup window.** "Device owner mode can't be provisioned on a
  device at any other time" than initial setup / just after factory reset
  (https://developers.google.com/android/work/play/emm-api/prov-devices). Some OEMs
  additionally block it once setup-wizard has fully completed with certain apps
  provisioned.
- **Provisioning disallowed by config** (rare, some managed/carrier builds):
  `java.lang.IllegalStateException: Trying to set the device owner, but device
  owner is already set` or a `provisioning not allowed` message.

Practical rule for staff: *fresh/factory-reset → skip ALL sign-in → enable
wireless debugging → pair → set-device-owner → THEN hand to customer to sign in.*
Adding the Google account first is the number-one cause of failure.

### 1.4 Wireless-ADB vs QR / afw#setup provisioning (retailer enrolling many phones)

| Aspect | Wireless-debugging ADB (Method A-wireless) | QR / `afw#setup` (Method B) |
|---|---|---|
| Cable | None | None |
| Per-phone manual steps | Enable dev-options, enable wireless debugging, pair (enter code), connect, install, run command | Tap welcome screen 6× → scan one QR (or type `afw#setup`); everything else automatic |
| APK hosting | Not required (push APK from bench PC) | **Required** — signed APK at a public URL + its signing-cert checksum in the QR JSON |
| Bench PC with adb | Required | Not required (any phone with the QR image) |
| Same-Wi-Fi requirement | Yes (workstation + phone on one LAN) | No (phone just needs internet to download the APK) |
| Throughput at scale | Slow — several taps + a code per phone, one bench at a time | Fast — a clerk can enrol many phones in parallel by scanning the same QR |
| Failure modes | Pairing/network flakiness, account-already-added | Wrong/missing signature checksum, download URL down |
| Best for | Low volume, ad-hoc, no hosting infra | High volume retail onboarding |

QR fields (already in `docs/DEVICE_OWNER_PROVISIONING.md`):
`PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME`,
`PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM`,
`PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION`,
`PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED`. Both methods yield the identical
Device Owner state; only the enrolment ergonomics differ. Recommendation: use
wireless-ADB now (no hosting), move to QR once the signed APK is hosted and the
checksum is computed, for any real retail volume.

---

## 2) Factory Reset Protection (FRP) account setup for a Device Owner app

### 2.1 API

Android 11 / API 30+
(https://developer.android.com/reference/android/app/admin/FactoryResetProtectionPolicy.Builder
— class registered `ApiSince=30`):

```java
List<String> accountIds = new ArrayList<>();
accountIds.add("000000000000000000000");   // numeric userId — see 2.2

dpm.setFactoryResetProtectionPolicy(
    adminName,
    new FactoryResetProtectionPolicy.Builder()
        .setFactoryResetProtectionAccounts(accountIds)
        .setFactoryResetProtectionEnabled(true)
        .build());

// REQUIRED: tell GMS the config changed (explicit intent so it isn't dropped)
Intent i = new Intent("com.google.android.gms.auth.FRP_CONFIG_CHANGED");
i.setPackage("com.google.android.gms");
context.sendBroadcast(i);
```

Only a **device owner** (or profile owner of an org-owned device) may call
`setFactoryResetProtectionPolicy`. Passing `null` or an empty list means the
accounts already on the personal profile are the ones authorized after reset.
(https://developer.android.com/work/dpc/security — "Control provisioning after
factory reset")

### 2.2 KEY QUESTION — exact string format for `setFactoryResetProtectionAccounts`

**It is the numeric Google account id ("Gaia" / `userId`), NOT the plain Gmail
address.** Google's Android Enterprise security guide is explicit:

- "The DPC uses the **`userID`** value to configure which accounts can provision a
  device after a factory reset."
- The sample uses `listOf("000000000000000000000")` with the comment "List of
  userId that can provision a factory reset device. You can use the value returned
  calling people/me endpoint."
  (https://developer.android.com/work/dpc/security)

**How to obtain the userId:** call the **Google People API** `people.get` with the
special resource `me`:
`GET https://people.googleapis.com/v1/people/me?personFields=metadata`
The response `resourceName` is `people/[userId]` where `[userId]` is an integer
string — that integer is the value to pass.
(https://developers.google.com/people/api/rest/v1/people/get)

Caveats from the same docs:
- "Newly-created accounts might not be available for factory reset purposes for
  **72 hours**." (https://developer.android.com/work/dpc/security)
- You must send the `FRP_CONFIG_CHANGED` explicit broadcast to
  `com.google.android.gms` after every change or GMS may not pick it up.

**On email addresses:** some third-party summaries claim a plain
`name@gmail.com` is also accepted, and it may appear to work on some builds, but
the *officially documented and reliable* value is the numeric `userId`. Real-world
reports confirm that setting the plain email produces a device that, after reset,
asks for a *different/unknown* account than intended — i.e. the email form is
unreliable across OEMs. See the XDA thread "FRP Policy Applied via
DevicePolicyManager, but After Reset, Device Asks for Unknown Google Account
Instead of one I Set as FRP Email"
(https://xdaforums.com/t/frp-policy-applied-via-devicepolicymanager-but-after-reset-device-asks-for-unknown-google-account-instead-of-one-i-set-as-frp-email.4734250/).
**Recommendation: always use the numeric userId from People API `people/me`.**

### 2.3 Which devices/OEMs honour `FactoryResetProtectionPolicy`

- **GMS is mandatory.** FRP is a Google Mobile Services feature (present on GMS
  devices running Android 5.1+); the enterprise policy path routes through
  `com.google.android.gms`. No GMS (e.g. many China-market ROMs, AOSP-only, some
  Huawei) → `FactoryResetProtectionPolicy` does effectively nothing.
  (https://developer.zebra.com/blog/factory-reset-protection)
- **API floor:** the policy API itself is Android 11 / API 30+. Older devices have
  FRP the *feature* but not this programmable per-account policy.
- **"OEM unlocking" (Developer options) must be OFF.** "Factory reset protection is
  disabled if OEM unlocking is enabled in Developer Options."
  (https://developer.android.com/work/dpc/security;
  https://developer.zebra.com/blog/factory-reset-protection)
- **OEM variance is real.** AOSP compliance is required by CDD but the exact
  post-reset UX and reliability differ by OEM. Samsung layers **Knox Guard /
  Samsung FRP** (a separate, stronger system) on top; several China-based OEMs
  (Xiaomi/MIUI, vivo, OPPO/ColorOS, Transsion) historically implement account
  verification differently and are the usual source of "asks for a different
  account" bug reports. **Treat FRP behaviour as device-specific and verify on
  each exact model you finance before relying on it.** (Do not assume uniform
  behaviour — this is the most OEM-fragile feature in this document.)
- Enterprise FRP applies to the account you configure; note Zebra's clarification
  that ordinary consumer FRP "does not apply to managed Google accounts typical of
  Device Owner mode" — which is exactly why you must *explicitly* set the
  authorized userId via the policy. (https://developer.zebra.com/blog/factory-reset-protection)

### 2.4 What the user sees after a reset, and the recovery-wipe limit

- After an **untrusted** factory reset (recovery-mode wipe, or Settings reset on a
  device where the reset isn't "authorized"), the setup wizard forces Wi-Fi entry
  then demands a **Google account that is on the FRP allow-list** — there is "no
  option to skip" either step. Only the configured account (your userId) unlocks
  setup. (https://developer.zebra.com/blog/factory-reset-protection)
- **No app can PREVENT a recovery-mode wipe.** Recovery/fastboot/EDL run outside
  the Android runtime, so neither a Device Owner nor any app executes there. A
  Device Owner can block the *in-Settings* reset via the `DISALLOW_FACTORY_RESET`
  user restriction, but that does nothing against a recovery-menu wipe, `fastboot
  -w`, or a flash. **FRP is the *post-wipe* gate, not wipe prevention** — after the
  wipe, the phone is bricked at setup until the configured account signs in. That
  is the correct and only reliable model to promise the business.
- Android 9+ nuance: a device with no screen lock (no PIN/pattern/password) set may
  *not* prompt for the account after an untrusted reset — so pairing FRP with an
  enforced device lock is advisable. (https://developer.zebra.com/blog/factory-reset-protection)

---

## 3) SMS-triggered remote lock/unlock (offline command channel)

Rationale: SMS reaches the phone even with no data/Wi-Fi, so it's a valid
last-resort channel to push LOCK/UNLOCK to a financed device that's gone offline.

### 3.1 Permissions & receiver

- Manifest: `<uses-permission android:name="android.permission.RECEIVE_SMS"/>`
- Broadcast: `android.provider.Telephony.SMS_RECEIVED`
  (`Telephony.Sms.Intents.SMS_RECEIVED_ACTION`). This is one of the few implicit
  broadcasts **exempted** from the Android 8.0+ manifest-registration ban, so a
  *manifest-declared* receiver still works: "SMS recipient apps rely on these
  broadcasts." (https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions)
- Read the PDUs in the receiver via `Telephony.Sms.Intents.getMessagesFromIntent(intent)`
  (or parse `pdus`/`format` extras). You do **not** need to be the default SMS app
  merely to *receive* `SMS_RECEIVED` with `RECEIVE_SMS`.

### 3.2 Can a Device Owner silently auto-grant `RECEIVE_SMS` to itself?

Yes for a **device owner**, with an important Android-15 caveat.

- `DevicePolicyManager.setPermissionGrantState(admin, pkg, permission,
  PERMISSION_GRANT_STATE_GRANTED)` grants a runtime permission with **no user
  prompt**, and "the permission is granted and the user cannot manage it through
  the UI." Callable by profile owner, device owner, or a `DELEGATION_PERMISSION_GRANT`
  delegate. It only works for permissions the target app actually declares in its
  manifest. (https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setPermissionGrantState%28android.content.ComponentName,%20java.lang.String,%20java.lang.String,%20int%29;
  full remarks mirrored at https://learn.microsoft.com/en-us/dotnet/api/android.app.admin.devicepolicymanager.setpermissiongrantstate?view=net-android-35.0)
- The documented *restrictions* on `setPermissionGrantState` are: (a) **sensor**
  permissions (fine/coarse/background location, camera, mic, body sensors, activity
  recognition; health on Android 16) — a *profile owner* can't grant these, a
  *device owner* still can by default; and (b) **`READ_SMS`** is blocked for
  **managed profile owners** only. **A Device Owner is not restricted for SMS
  permissions in that list**, so a Device Owner granting `RECEIVE_SMS` is within
  policy. (Same source; note the restriction list is profile-owner-centric.)
- Recommended call (grant the whole SMS group together, as the docs advise):
  ```java
  dpm.setPermissionGrantState(admin, "com.telepoint.customer",
      Manifest.permission.RECEIVE_SMS,
      DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
  ```

**Android 15 hard-restricted caveat (verify per device):** in Android 15
(API 35) Google reclassified `SEND_SMS`/`RECEIVE_SMS` as **hard-restricted**
permissions for apps **not installed from Google Play** (sideloaded). For a plain
sideloaded app the SMS toggle is greyed out and the user must manually do App info
→ ⋮ → **Allow restricted settings** → Permissions → SMS → Allow.
(https://textbee.dev/blog/android-15-send-sms-permission-guide;
https://support.google.com/googleplay/android-developer/answer/10208820) A raw
`pm grant` can then fail with: `Cannot grant hard restricted non-exempt permission
android.permission.RECEIVE_SMS for package …`
(https://gist.github.com/Trigus42/e33fe89c6fd19aff095dd0f1a3277ce0).

For TelePoint this is **manageable but must be tested on Android 15 hardware**:
  - The app is installed **by the Device Owner / during provisioning**, so its
    installer is a privileged/DPC installer, which normally *exempts* it from the
    hard restriction (Play-installed and system/DPC-installed apps are exempt).
  - The reliable belt-and-braces at enrolment time (we already have an adb shell):
    ```
    adb shell pm grant com.telepoint.customer android.permission.RECEIVE_SMS
    # if the "hard restricted non-exempt" error appears, re-grant at install:
    adb shell pm path com.telepoint.customer
    adb shell pm install -g -r /data/app/.../base.apk    # -g grants all incl. restricted
    ```
  - Preferred in-app path: call `setPermissionGrantState(GRANTED)` from the Device
    Owner (no adb, no user tap). **Flag:** whether the Device-Owner policy grant
    bypasses the Android-15 hard restriction for a sideloaded APK is
    version/OEM-dependent and is the one item here to confirm on real Android 15/16
    devices before shipping the SMS channel.

### 3.3 Google Play policy implications — and whether they matter here

- Play's **SMS/Call-Log policy** restricts `RECEIVE_SMS`/`READ_SMS`/`SEND_SMS`:
  an app on Play generally must be the user's **default SMS handler** (or fit a
  narrow exception) to request them, or be removed.
  (https://support.google.com/googleplay/android-developer/answer/10208820)
- **This does not bind TelePoint if the app is NOT distributed through Google
  Play.** The customer APK is sideloaded and Device-Owner-provisioned, so the Play
  Console review/declaration requirements do not apply. What *does* still apply is
  the OS-level Android-15 hard-restriction (§3.2) — that's an OS behaviour, not a
  Play-store policy, and it hits sideloaded apps regardless. So: no Play policy
  problem; yes, an OS permission-grant step to get right on Android 15+.

### 3.4 Android version restrictions on receiving SMS in the background

- **Android 8.0 (API 26):** manifest implicit-broadcast ban — but `SMS_RECEIVED`
  is explicitly **exempt**, so a manifest receiver keeps working. (§3.1 source)
- **Android 14 (API 34):** context-registered broadcasts are **queued while the
  app is cached** and delivered when it leaves the cached state; manifest-declared
  receivers (like ours) are *not* queued and the app is pulled out of the cached
  state to receive them. Also, implicit broadcasts are only delivered to
  **exported** components — mark the SMS receiver `android:exported="true"`.
  (https://developer.android.com/develop/background-work/background-tasks/broadcasts;
  https://developer.android.com/about/versions/14/behavior-changes-all)
- **Android 15 (API 35):** the hard-restricted SMS-permission change in §3.2 is the
  material one. `BOOT_COMPLETED` receivers also gained restrictions on starting
  some foreground-service types — relevant if the SMS receiver kicks off a FGS to
  act on the command; do the lock work directly / via the Device Owner APIs rather
  than an FGS where possible. (https://developer.android.com/about/versions/15/changes/foreground-service-types)
- **Android 16:** no additional SMS-*reception* restriction found beyond the
  15 baseline as of this research; continue to treat the hard-restriction handling
  as the gating item. (Flag: re-verify on 16 hardware.)
- Keep the receiver's work tiny/synchronous (a `BroadcastReceiver` has ~10s before
  ANR); hand off to a `goAsync()` + short worker, or directly invoke the
  DevicePolicyManager lock, rather than long processing in `onReceive`.

### 3.5 Security best practices for the SMS command channel

SMS is unauthenticated, spoofable, and cleartext, so the payload must carry its
own cryptographic authenticity, freshness, and anti-replay. Recommended:

1. **HMAC-SHA-256 signature** over the canonical command string using a
   per-device secret provisioned at enrolment (never a global key). Verify with a
   constant-time compare.
2. **Freshness window:** include a UTC timestamp; reject if `|now - ts|` exceeds a
   small window (e.g. 5 min) to blunt replay of captured messages.
3. **Anti-replay nonce:** include a monotonically increasing counter or random
   nonce; persist the last-seen counter / a small seen-nonce set and reject repeats
   even inside the freshness window.
4. **Sender allow-list (defence in depth, not primary):** optionally accept only a
   known gateway sender-ID/number — but sender numbers are spoofable, so this is a
   filter, never the trust anchor. The HMAC is the trust anchor.
5. **Device binding:** include the device id (IMEI/enrolment id); reject if it
   doesn't match this device, so one intercepted message can't be broadcast to
   others.
6. **Scope:** only ever accept LOCK / UNLOCK-request-token style commands over SMS;
   never anything that exfiltrates data. Log every accepted/rejected command.

Concrete message format (fits one 160-char SMS; pipe-delimited canonical string,
truncated HMAC to save length):

```
TP|v1|<deviceId>|<cmd>|<counter>|<unixts>|<hmac16hex>

# canonical string signed = "TP|v1|<deviceId>|<cmd>|<counter>|<unixts>"
# hmac16hex = first 16 hex chars (64 bits) of HMAC-SHA256(secret, canonical)
# cmd ∈ { LOCK, UNLOCK }   (UNLOCK should still require server-side auth if online)
# example:
TP|v1|TP42931|LOCK|1075|1759238400|9af31c0b7e2d4a15
```

Receiver logic: parse → check `deviceId` == this device → check `counter` >
last-seen → check timestamp within window → recompute HMAC and constant-time
compare → only then apply the Device Owner lock and persist `counter`. Reject and
log otherwise. Never echo the secret or the computed HMAC anywhere.

---

## Summary of hard limits / uncertainties (read before relying on any of this)

- **Wireless-ADB Device Owner** works exactly like USB, but only on a
  fresh/no-account device — the "accounts already on the device" failure is the
  main gotcha.
- **FRP account = numeric userId (Gaia) from People API `people/me`**, not the
  email; email is unreliable across OEMs. Requires GMS, OEM-unlock OFF, and is
  **highly OEM-specific** — verify on each financed model.
- **No app can stop a recovery-mode wipe**; FRP only gates *after* the wipe.
- **Device Owner can silently grant `RECEIVE_SMS`**, and Play's SMS policy doesn't
  bind a sideloaded app — but **Android 15's hard-restricted SMS change** for
  sideloaded APKs must be tested on real 15/16 hardware; keep the adb `pm install -g`
  fallback in the provisioning runbook.
