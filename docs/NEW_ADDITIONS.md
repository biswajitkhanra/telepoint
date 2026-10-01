# TelePoint — New Additions (what changed since the old setup)

Everything added while finishing the Android device-management + reminder stack.
Use this as the "make sure the new environment has all of this" checklist.

## 1. New environment variables
**Web (Vercel):** `CUSTOMER_SESSION_SECRET`, `CUSTOMER_ID_REQUIRES_SESSION`,
`DEVICE_COMMAND_TTL_MINUTES`, `CRON_SECRET`, `BACKUP_TOKEN`, `NEXT_PUBLIC_APP_URL`
(plus the standard Supabase trio). See `.env.example`.
**Mobile (EAS):** `EXPO_PUBLIC_FRP_ACCOUNTS` (FRP numeric Gaia id),
`EXPO_PUBLIC_SMS_ALLOWED_SENDERS`. See `mobile/.env.example`.

## 2. New DB migrations (apply in order; there is no 033)
| File | Adds |
|---|---|
| `030_device_management.sql` | `devices`, `device_commands`, RLS, audit hardening |
| `031_push_tokens.sql` | `push_tokens` |
| `032_reminder_config_and_manual_reminder.sql` | `reminder_settings`, `EMI_REMINDER` command, extended statuses |
| `034_device_actions.sql` | `device_commands.payload`, `DEVICE_ACTION`, `devices.policies` |
| `035_device_location_sim.sql` | `devices.last_location`, `devices.sim_info` |
| `036_totp_offline_unlock.sql` | `devices.totp_secret` |

## 3. New API routes (Next.js)
`/api/device/command` (+ `/command/ack`), `/api/device/commands`, `/api/device/register`,
`/api/device/heartbeat`, `/api/device/status`, `/api/device/retailer`,
`/api/device/reminder-config`, `/api/device/totp`. New page: `/admin/provision` (QR generator).

## 4. New native modules / files (Android, in `mobile/modules/`)
- **`expo-telepoint-reminders`** — AlarmManager exact-alarm reminder engine + TTS + boot receiver.
- **`expo-telepoint-device-management`** additions:
  `DeviceActions`, `WallpaperManagerHelper`, `OemPermissionHelper`, `SmsCommandReceiver`
  (+ `SmsCommandStore`), `SimSentinelReceiver` (+ `SimSentinelStore`), `TrackingStore`,
  `Totp`. (`TelepointAccessibilityService` is REQUIRED — owner-authorized deterrent against uninstall/reset + per-app lock overlay; declared in the manifest with its `res/xml` config and enabled during provisioning.)

## 5. New Android permissions (`mobile/app.json`, customer app)
`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `WAKE_LOCK`, `RECEIVE_SMS`, `SEND_SMS`,
`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
`READ_PHONE_STATE`, `READ_PHONE_NUMBERS`, `CHANGE_WIFI_STATE`, `ACCESS_WIFI_STATE`,
`SET_WALLPAPER`, `INTERNET`, `ACCESS_NETWORK_STATE` (plus the pre-existing boot/
notification/battery ones). Retailer app is trimmed to network-only. Details +
rationale in `docs/android-permissions.md`.

## 6. New mobile dependencies
`@react-native-cookies/cookies` (retailer WebView session flush). `expo-file-system`
is used (lazy) for the offline photo cache — ensure it's installed.

## 7. New config constants (`mobile/src/config.ts`)
`FRP_PROTECTION_ACCOUNTS`, `SMS_ALLOWED_SENDERS`, reminder storage keys.

## 8. New docs
`FRESH_SETUP_GUIDE.md`, `eas-build-runbook.md`, `telepoint-device-management-guide.md`,
`android-permissions.md`, `android-implementation-audit.md`, `android-final-verification.md`,
`requirements-coverage-checklist.md`, `frp-and-sms-provisioning-research.md`, this file.

## 9. Things you must set per-company (not in code)
- FRP account **numeric Gaia id** → `EXPO_PUBLIC_FRP_ACCOUNTS`.
- Authorised SMS numbers → `EXPO_PUBLIC_SMS_ALLOWED_SENDERS`.
- `CUSTOMER_SESSION_SECRET` (web) — a strong random secret.
- The customer APK public URL + signing SHA-256 → used by the provisioning QR.
