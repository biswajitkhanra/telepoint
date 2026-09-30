# TelePoint — Fresh Setup (New Supabase + Vercel + Expo)

End-to-end setup of a **brand-new** environment and deployment of both apps. Run
top to bottom. Where a step needs your login (Supabase / Vercel / Expo), it's
marked **[you run]** — those can't be automated for you.

**Related:** `docs/NEW_ADDITIONS.md` (everything new since the old setup),
`.env.example` (web), `mobile/.env.example` (app), `docs/eas-build-runbook.md`,
`docs/DEVICE_OWNER_PROVISIONING.md`.

---

## PART A — Supabase (new project)

1. **[you run]** Create a project at https://supabase.com → note the **Project URL**
   and, in **Settings → API**, the **anon** key and the **service_role** key.
2. **Apply the schema.** In **SQL Editor**, run the migration files from `migrations/`
   in ascending order. Fastest for a fresh DB:
   - Run **`999_full_schema.sql`** (consolidated base schema), then
   - Run **`030`, `031`, `032`, `034`, `035`, `036`** in that order (device
     management, reminders, device actions, location/SIM, TOTP). *(There is no 033.)*
   Each file is idempotent, so re-running is safe. Watch for the `NOTICE` at the end
   of each.
3. **Create the admin + retailer logins.** The portal maps usernames to emails:
   admin `telepoint` → `telepoint@admin.local`; a retailer `store1` → `store1@tele.local`.
   - **[you run]** Authentication → Users → **Add user**: email `telepoint@admin.local`,
     a strong password, **Auto-confirm**. Repeat for each retailer (`<name>@tele.local`).
   - In **SQL Editor**, link roles (replace the UUIDs with the users' `id` from Auth):
     ```sql
     -- Super admin
     insert into profiles (user_id, role) values ('<admin-auth-uuid>', 'super_admin')
       on conflict (user_id) do update set role = excluded.role;
     -- A retailer (also needs a retailers row the device APIs resolve ownership from)
     insert into profiles (user_id, role) values ('<retailer-auth-uuid>', 'retailer')
       on conflict (user_id) do update set role = excluded.role;
     insert into retailers (name, mobile, auth_user_id)
       values ('Store One', '7003617029', '<retailer-auth-uuid>');
     ```
     *(Check the exact columns of `profiles` / `retailers` in `migrations/001_initial.sql`
     if your schema differs.)*
4. **(If you store customer photos in Supabase Storage)** create a public bucket
   (e.g. `customer-photos`) and use its public URLs as `customers.customer_photo_url`.

---

## PART B — Vercel (new project)

1. **[you run]** Import this repo at https://vercel.com/new (framework auto-detected
   as Next.js; root directory = repo root).
2. **[you run]** Add **Environment Variables** (Production + Preview) from `.env.example`:
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret) |
   | `NEXT_PUBLIC_APP_URL` | your final Vercel URL (set after first deploy) |
   | `CUSTOMER_SESSION_SECRET` | a long random string (32+ chars) |
   | `CUSTOMER_ID_REQUIRES_SESSION` | `true` |
   | `DEVICE_COMMAND_TTL_MINUTES` | `4320` |
   | `CRON_SECRET`, `BACKUP_TOKEN` | random secrets |
3. **[you run]** Deploy. Note the production URL (e.g. `https://telepoint-xyz.vercel.app`),
   then set `NEXT_PUBLIC_APP_URL` to it and redeploy.
4. Verify: open the URL → `/login` → sign in as `telepoint` (admin). You should reach `/admin`.

CLI alternative (from the repo root, **[you run]**):
```bash
npm i -g vercel
vercel link          # link to the new project
vercel env add ...   # add each variable
vercel --prod        # deploy
```

---

## PART C — Expo / EAS (new project)

1. **[you run]** From `mobile/`:
   ```bash
   npm install
   npm i -g eas-cli && eas login
   eas init            # creates a NEW Expo project id (updates app.json extra.eas.projectId)
   ```
2. Point the app at your NEW backend. Either edit `mobile/eas.json` `env` blocks, or
   set EAS env vars, for BOTH the `customer` and `retailer`/`admin` profiles:
   - `EXPO_PUBLIC_PORTAL_URL` = your Vercel URL
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` = your Supabase values
   - `EXPO_PUBLIC_FRP_ACCOUNTS` = the FRP account's **numeric Gaia id**
   - `EXPO_PUBLIC_SMS_ALLOWED_SENDERS` = e.g. `7003617029,7003617074`
   *(The old project's URL/keys are baked as fallbacks in `app.config.ts` / `app.json` —
   your env values override them. Update those fallbacks too if you want no trace of the old.)*
3. Build (see PART E).

---

## PART D — Wire it together
- The **customer app** talks to Supabase + the portal (`EXPO_PUBLIC_*`).
- The **retailer app** is a WebView of the portal (`EXPO_PUBLIC_PORTAL_URL`).
- Device enrolment uses the **provisioning QR** generated at `<portal>/admin/provision`
  (needs the customer APK's public URL + its signing SHA-256).

---

## PART E — Deploy BOTH apps  **[you run]**

> These run cloud builds/deploys under YOUR accounts and can't be automated here.
> Run them from your terminal (or paste with a leading `!` in this session).

**Web portal** is already deployed in PART B (Vercel). To redeploy after changes:
`git push` to the connected branch, or `vercel --prod`.

**Mobile — both apps:**
```bash
cd mobile
npm install
eas build -p android --profile customer   # → com.telepoint.customer  (APK)
eas build -p android --profile retailer    # → com.telepoint.retailer  (APK)
```
Download both APKs from the EAS build pages. Host the **customer** APK at a public
`https://` URL and get its signing SHA-256 (`eas credentials`) for the provisioning QR.

A convenience script is provided: `scripts/build-apps.ps1` (Windows PowerShell) runs
both builds after you've done `eas login`.

---

## Verification checklist
- [ ] Portal loads; admin + a retailer can sign in.
- [ ] Migrations 999 + 030–036 applied (no errors); `devices`, `device_commands`,
      `reminder_settings`, `push_tokens` tables exist.
- [ ] Both APKs build green on EAS.
- [ ] Customer app logs in against the NEW backend; retailer WebView loads the NEW portal.
- [ ] A phone provisions as Device Owner via the QR from `<portal>/admin/provision`.
- [ ] Then run the on-device matrix in `docs/telepoint-device-management-guide.md` §9.
