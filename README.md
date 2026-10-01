# TelePoint ✨

<div align="center">

<a href="https://github.com/biswajitkhanra/telepoint">
  <img src="./public/telepoint-animated-hero.svg" alt="Animated TelePoint hero showing real finance and mobile payment imagery" width="100%" />
</a>

<br />

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=700&size=24&duration=3200&pause=900&color=3A67DD&center=true&vCenter=true&width=760&lines=Collect+EMIs+with+confidence;Give+retailers+the+right+visibility;Keep+customers+in+control" alt="TelePoint animated tagline" />

<br />

[![TelePoint](https://img.shields.io/badge/TelePoint-EMI%20Portal-3A67DD?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://github.com/biswajitkhanra/telepoint)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-React%20Native-000020?style=flat-square&logo=expo&logoColor=white)

</div>

> Premium EMI collection, retailer management, and customer finance workflows built with Next.js, Supabase, and a mobile-first customer experience.

## ✨ Why TelePoint?

TelePoint helps lending teams and retailers manage EMI schedules, customer follow-ups, approval flows, collections, and mobile-first reminders without a clunky legacy workflow.

| | Workflow | What it unlocks |
|---|---|---|
| 💸 | **EMI tracking** | Real-time schedules and fine calculation |
| 📊 | **Operations dashboards** | Retailer portfolios and collection insights |
| 🔔 | **Smart reminders** | Customer broadcasts and follow-up flows |
| 📱 | **Customer access** | EMI visibility from a mobile-first portal |
| 🧾 | **Audit-ready operations** | Backups, logs, exports, and reporting |

## 🎬 A real-image animated preview

The hero above is a repository-hosted animated SVG that crossfades through real finance and payment photography, then layers TelePoint branding and motion on top. It gives the README a living product feel while keeping the asset versioned with the project.

> **Note:** The preview uses fixed Unsplash image URLs for the photographic frames. Replace them with approved product screenshots or self-hosted images in `public/telepoint-animated-hero.svg` when branding or privacy requirements call for it.

## 🚀 Live experience

- ✨ Animated gradient hero and floating accents
- 💎 Glassmorphism cards and premium UI polish
- 🚀 Fast customer and retailer onboarding flows
- 📲 Mobile-ready layout for everyday field use

## 🧱 Tech stack

- Next.js 14 and React 18
- TypeScript and Tailwind CSS
- Framer Motion
- Supabase SSR + Postgres
- Expo / React Native for the mobile app

## 📁 Project structure

```text
telepoint/
├── app/                    # Next.js app router pages and API routes
├── components/             # Reusable UI blocks and dashboards
├── lib/                    # Utility logic, formatters, motion config, auth helpers
├── public/                 # Static assets, branding, and README hero
├── mobile/                 # Standalone Expo Android app
├── backups/                # Automated database backup snapshots
├── backup/                 # Backup docs and setup workflows
├── docs/                   # Additional documentation and notes
├── middleware.ts           # Request middleware
├── package.json            # Web app dependencies and scripts
└── README.md               # This file
```

## ⚡ Quick start

### Web app

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

### Mobile app

```bash
cd mobile
npm install
npm start
```

## 🔐 Environment variables

Create a local environment using your Supabase project values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🔄 Core workflows

- Admin portal for loan approval and operation oversight
- Retailer dashboard for customer portfolios and collections
- Customer EMI portal for account visibility and checklists
- Broadcast messaging and reminder systems
- CSV/export and full backup flows for operational resilience

## 📚 Documentation

- `mobile/README.md` — mobile app documentation and deployment notes
- `backup/README.md` — secure database backup instructions
- `backups/README.md` — stored backup snapshot notes
- `docs/` — supporting operational and product docs

## 🎨 Design direction

TelePoint aims for a premium, trustworthy fintech feel: deep navy and metallic blue surfaces, soft glass layers, deliberate motion, and human visual accents without sacrificing clarity.

## Status

This repository is actively shaped around a full EMI management and collection platform with both web and mobile touchpoints.

---

Built with ❤️ for a premium fintech workflow experience.

---

## 📱 Android + Consent-Based EMI Device Management

TelePoint finances phones on EMI; the device is the collateral. With the
customer's **explicit** consent and the Android device-admin permission they
grant themselves, an authorised retailer/admin can request the financed device
to enter its **lock** state when the account is overdue. It uses only
documented Android APIs (`DevicePolicyManager` / `DeviceAdminReceiver`) — no
root, no hidden APIs, no permission bypass, and no fake system UI. The customer
app also declares the owner-authorized accessibility service, which is
**required** as an additional deterrent against uninstall/reset and Settings
tampering and powers per-app locking; Device Owner remains the guaranteed
uninstall/reset block. Payment resolution unlocks it.

### Architecture (server-authoritative)

```
Retailer/Admin app ──Bearer──▶ /api/device/command  (authorise: role + ownership + registered device)
                                        │  writes device_commands (PENDING) + audit_log
                                        ▼
Customer app ──poll /api/device/commands──▶ validate (owner + device + expiry + idempotency)
                                        ▼
        expo-telepoint-device-management (native) ── DevicePolicyManager.lockNow()
                                        ▼
        /api/device/command/ack ──▶ device.management_status = LOCKED  (only on the device's word)
```

The backend distinguishes **LOCK REQUESTED** (`PENDING`) from **CONFIRMED
LOCKED** (`EXECUTED` + `management_status = LOCKED`). A retailer never sees
"locked" from a button press alone.

### Management modes (capability-aware)

Lock capability depends on the device's Android management mode, surfaced in the
app and honestly limited:

| Mode | Lock supported |
|---|---|
| `DEVICE_ADMIN` (customer granted device admin) | Yes — `lockNow()` |
| `DEVICE_OWNER` (fully managed / provisioned) | Yes |
| `PROFILE_OWNER` (work profile) | No (cannot lock the whole personal device) |
| `UNMANAGED` | No (guide the customer to grant the permission) |

Where a mode does not support an operation, the app says so and points to the
required enrolment instead of attempting a bypass.

### Database

Apply the migration in the Supabase SQL editor (matches the existing manual
migration workflow):

```
migrations/030_device_management.sql
```

It adds `devices` and `device_commands` (with RLS, indexes, and a partial unique
index preventing duplicate in-flight commands), and hardens the `audit_log`
insert policy (previously world-writable via the anon key).

### Build (Expo dev build / EAS — Expo Go is NOT sufficient)

The native module lives at `mobile/modules/expo-telepoint-device-management`
(auto-linked). Expo Go cannot provide device management — use a development or
EAS build.

```bash
cd mobile
npm install
# provide Supabase config (anon key is publishable; service-role key must NEVER be here)
export EXPO_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
export EXPO_PUBLIC_PORTAL_URL="https://<your-portal>"
npx expo prebuild
npx expo run:android           # or: eas build --platform android --profile preview
```

Two Android experiences share the codebase (existing role selection is reused).
To ship separate installs:

```bash
TELEPOINT_APP_VARIANT=customer  npx expo run:android   # com.telepoint.customer (default)
TELEPOINT_APP_VARIANT=retailer  npx expo run:android   # com.telepoint.retailer
```

### Customer flow

Login (existing Aadhaar/mobile auth, session persisted) → EMI dashboard →
Profile → **Device Management** → read consent → *"I understand and continue"* →
Android grants the permission (system dialog) → device registered
(`customer + loan + retailer` resolved server-side; a SecureStore installation
id, not a hardware id). When the backend confirms a lock, the app shows its own
branded **Device Locked** screen with the live amount due and the retailer's
name/phone (both from the backend, never hard-coded) and a **Call Retailer**
button that opens the dialer.

### Retailer flow

Sign in (real Supabase Auth — the previous hard-coded key and no-password
fallback were removed) → open a customer → request **LOCK** / **UNLOCK**. The
server verifies role, retailer↔customer ownership, and a registered device
before creating the command and writing the audit log.

### Security notes

- Identity, role, ownership, EMI amount and device status are resolved
  server-side; the client is untrusted.
- The Supabase **service-role key is never in the app**; only the publishable
  anon key ships. Edge/authorisation logic runs in the Next.js API routes with
  the service client.
- Commands expire (`expires_at`, 15 min) and are idempotent by UUID + terminal
  status; a command never executes twice, and expired commands never execute.
- RLS: customers read only their own records; retailers only their own
  customers/devices/commands; command creation flows only through the authorised
  server route.

### Verification status

- `node --test` — 43/43 pass (incl. 10 new command-validation tests).
- `tsc --noEmit` (web and mobile) — 0 errors.
- On-device lock execution requires a physical Android device / emulator and is
  **not** exercised in CI here; test it on a development build per the steps
  above.

### Lock policy (updated)

- **Consent at purchase.** The customer agrees to EMI device management as part
  of the financing agreement. The device is auto-registered on first app run
  with that consent recorded — no separate in-app consent step is required. The
  Android device-admin **permission** is still granted explicitly by the
  customer in the OS dialog (never bypassed); until it is granted, a lock
  request simply reports `admin_inactive`.
- **Lockable only until the EMI is cleared.** Admin/retailer can lock with a
  single button press (no extra details needed) at any time while the loan is
  `RUNNING` or `NPA`. Once the loan is fully cleared (`COMPLETE`/`SETTLED`), the
  server refuses new LOCK commands — the collateral is released. UNLOCK is
  always permitted.

### Making the app un-removable until EMI is paid (Device Owner)

The goal "the customer cannot uninstall/disable the app until the EMI is fully
paid" is only achievable on Android when the phone is enrolled as **Device
Owner** (fully managed). Only then can the app block its own uninstall
(`setUninstallBlocked`) and prevent the customer from removing management. On a
normal device-admin phone Android **guarantees** the user can uninstall or
revoke admin — no app can prevent that without root/exploits (which this project
does not use).

Practical setup: enroll the financed phone as Device Owner at the store during
purchase (factory-reset provisioning, e.g. the `afw#setup` / QR flow, or
`adb shell dpm set-device-owner com.telepoint.customer/.TelepointDeviceAdminReceiver`
for testing). Once enrolled:

- While the loan is `RUNNING`/`NPA`, the app keeps `setUninstallBlocked(true)` —
  it cannot be removed, and stays lockable.
- When the loan becomes `COMPLETE`/`SETTLED`, the app releases the block
  automatically — the customer regains full control.
- The app **collects no personal data** — only device model / OS version / a
  random install id — it simply stays installed and lockable until the EMI is
  cleared.
- If the customer tries to remove management, Android shows a message asking
  them to contact their retailer.

Lock/unlock is **admin-only** and works from **both** the web portal (admin
customer detail → Device Management panel, which auto-checks device-admin
status) and an authenticated admin on mobile. The device never auto-locks on its
own; an admin triggers it, and the newest admin action (lock or unlock) always
supersedes any in-flight command.

### Single-purpose builds (unlike the web)

The web serves every role from one deployment. The two Android apps are
single-purpose, driven by `TELEPOINT_APP_VARIANT` (via `app.config.ts` →
`extra.appVariant`, read in `mobile/src/config.ts`):

- **Customer app** (`TELEPOINT_APP_VARIANT=customer`, `com.telepoint.customer`):
  shows **only** the customer login. No role picker, no staff login — the
  "switch to staff" entries are hidden.
- **Retailer/Admin app** (`TELEPOINT_APP_VARIANT=retailer`, `com.telepoint.retailer`):
  shows **only** the staff (admin/retailer) login. The "back to customer"
  entries are hidden.
- **Combined** (default, dev): keeps the role-selection screen so one binary can
  do both.

Both apps talk to the same TelePoint backend and reuse the same EMI, payment,
retailer and device logic as the web — only the entry point differs.
