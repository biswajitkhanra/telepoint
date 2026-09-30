# TelePoint — Your Action Checklist

Things **you** need to do (they need your logins/decisions). Items marked
**[ask Claude]** I can do for you on request.

## 🔴 P0 — Security first (the repo was PUBLIC)
- [ ] **Make the repo private** — GitHub → repo → Settings → General → Danger Zone → Change visibility → **Private**.
- [ ] Decide on the **SMS channel**: its command format was briefly public and sender numbers can be spoofed → **[ask Claude]** to switch to HMAC-signed SMS (recommended).
- [ ] Decide on the **FRP account**: the Gaia id/email alone can't unlock a phone (needs the password), but rotate to a different account if you want to be safe.
- [ ] **[ask Claude]** to scrub the FRP id + SMS numbers out of committed source into env-only, so a future push can't re-expose them.

## 🟠 P1 — New Supabase project
- [ ] Create a new project at supabase.com → copy **Project URL**, **anon** key, **service_role** key (Settings → API).
- [ ] In SQL Editor, run `migrations/999_full_schema.sql`, then `030, 031, 032, 034, 035, 036` (in order; there is no 033).
- [ ] Add admin user `telepoint@admin.local` (auto-confirm) → insert `profiles` row `role='super_admin'`.
- [ ] Add each retailer `<name>@tele.local` → insert `profiles` `role='retailer'` + a `retailers` row (`auth_user_id`).
- [ ] (If you store photos in Supabase) create a public storage bucket.
> Full SQL snippets in `docs/FRESH_SETUP_GUIDE.md` → PART A.

## 🟡 P2 — New Vercel project (web portal)
- [ ] Import the repo at vercel.com/new.
- [ ] Set env vars from `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CUSTOMER_SESSION_SECRET` (long random), `CUSTOMER_ID_REQUIRES_SESSION=true`, `DEVICE_COMMAND_TTL_MINUTES=4320`, `CRON_SECRET`, `BACKUP_TOKEN`.
- [ ] Deploy → note the URL → set `NEXT_PUBLIC_APP_URL` to it → redeploy.
- [ ] Verify: `/login` → sign in as `telepoint` → lands on `/admin`.

## 🟢 P3 — Build both apps (Expo/EAS)
- [ ] `cd mobile && npm install`
- [ ] `eas login` (you're already logged in as biswajit.khanra82@gmail.com)
- [ ] `eas init` → creates a NEW project id (the current one belongs to another team).
- [ ] Set EAS env for BOTH `customer` and `retailer` profiles: `EXPO_PUBLIC_PORTAL_URL` (new Vercel URL), `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`, `EXPO_PUBLIC_FRP_ACCOUNTS` (numeric Gaia id), `EXPO_PUBLIC_SMS_ALLOWED_SENDERS`.
- [ ] `eas build -p android --profile customer`  → `com.telepoint.customer`
- [ ] `eas build -p android --profile retailer`  → `com.telepoint.retailer`
- [ ] Download both APKs.
> Or run `scripts/build-apps.ps1` after `eas login`.

## 🔵 P4 — Enrol a phone (no computer)
- [ ] Host the **customer APK** at a public `https://` URL.
- [ ] Get its signing **SHA-256**: `eas credentials` → Android → Keystore.
- [ ] Open `<your-portal>/admin/provision` → paste APK URL + SHA-256 (+ store Wi-Fi) → **Generate QR**.
- [ ] Factory-reset a phone → at setup, tap the screen **6×** → scan the QR → it becomes Device Owner.

## ⚪ P5 — Test on the device
- [ ] Run the matrix in `docs/telepoint-device-management-guide.md` §9 (lock/unlock, reminders, SMS from both numbers, TOTP unlock, camera/BT/USB/etc., location/SIM, SIM-removal lock, App Hide, reboot, release-on-closure).
- [ ] ⚠️ **FRP 72-hour rule:** do NOT hardware-wipe-test for 72h after creating the FRP account (GMS may brick the test phone).

---
### What Claude can do for you (just ask)
- Scrub FRP id + SMS numbers from source → env-only.
- Implement HMAC-signed SMS (harden the offline channel).
- Add per-app PIN overlay (#10) or literal 3 tabs (#27) for exact screenshot parity.
- Any code change. (Claude cannot log into your Supabase/Vercel/Expo or deploy.)
