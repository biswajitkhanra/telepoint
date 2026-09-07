# 📱 Telepoint Mobile — Standalone Android Application

Production-grade Expo React Native Android application for Telepoint customers.
Designed with bank-grade 3D immersive aesthetics, automated push notifications (5-day lookahead EMI reminders and store broadcasts), and permanent standalone APK distribution.

---

## 🚀 Key Features

1. **Standalone Android APK Distribution (No Google Play / Android Studio Needed):**
   - Directly installable `.apk` builds via EAS Build.
   - Permanent installation on customer devices.
   - Internal distribution profiles for instant customer onboarding.

2. **OTA Updates (EAS Update):**
   - Push JavaScript/UI updates instantly over the air without rebuilding or reinstalling the native APK.

3. **Automated & Idempotent Push Notifications:**
   - **5-Day EMI Lookahead Reminders:** Automatically triggers daily at 09:00 AM IST. Zero duplicate notifications guaranteed via database-level idempotency keys.
   - **Store Broadcasts:** Instant push notifications when retailers or admins publish announcements, with support for single-customer targeting and retailer-wide targeting.

4. **Bank-Grade 3D Immersive UI/UX:**
   - Obsidian navy & metallic sapphire color palette.
   - 3D tactile cards with bevel highlights and elevation shadows.
   - Real-time loan countdown, upcoming EMI alerts, and UPI payment intents.
   - Haptic feedback integration (`expo-haptics`).

---

## 🛠️ Project Structure

```
telepoint/
├── mobile/
│   ├── assets/               # Brand icon, splash screen, notification icons
│   ├── src/
│   │   ├── components/       # Card3D, EmiHeroCard, BroadcastModal
│   │   ├── context/          # AuthContext (session, push token lifecycle)
│   │   ├── navigation/       # Bottom tabs & deep link routing
│   │   ├── screens/          # Login, Dashboard, EmiSchedule, Broadcasts, Profile
│   │   ├── services/         # API client & Expo Push Notifications service
│   │   ├── types/            # TypeScript interfaces
│   │   └── config.ts         # Theme tokens & endpoint configuration
│   ├── app.json              # Expo application configuration (com.telepoint.customer)
│   ├── eas.json              # EAS Build profiles (development, preview, production APKs)
│   ├── tsconfig.json         # TypeScript configuration
│   └── package.json          # Dependencies (Expo 51, React Native 74)
```

---

## 📲 Build & Deployment Commands

### 1. Run in Development Mode (Live Reload)
To run the development server with live TypeScript reload:
```bash
cd mobile
npm start
```

### 2. Build Development APK (Supports live reload with local server)
```bash
eas build --platform android --profile development
```
*Outputs an installable APK that connects to `npx expo start --dev-client` for live development without Android Studio.*

### 3. Build Permanent Standalone APK (Install directly on Android)
```bash
eas build --platform android --profile preview
```
*Generates a permanent, standalone `.apk` that runs independently, persists on the phone, and receives remote push notifications.*

### 4. Publish Instant OTA Updates (EAS Update)
To deploy UI or logic updates without rebuilding the APK:
```bash
eas update --branch preview --message "Updated dashboard and notification handlers"
```

---

## 🔐 Credentials & Secrets Setup

### 1. EAS Secrets
In your Expo dashboard or via CLI:
```bash
eas secret:create --name EXPO_PUBLIC_PORTAL_URL --value "https://your-telepoint-portal.vercel.app"
```

### 2. Android Push Notifications (FCM v1 / Expo Push)
1. In Firebase Console, create or open your Firebase project for Telepoint.
2. In Project Settings → Service Accounts, generate a private key JSON.
3. In your Expo dashboard (Project → Credentials → Android), upload the FCM v1 service account credentials.
4. Set `EXPO_ACCESS_TOKEN` in your Next.js environment if using authenticated push dispatch.

---

## 🧪 Testing Push Notifications

1. Log into the mobile app using an Aadhaar or Mobile number.
2. Verify token registration in Supabase table `customer_app_tokens` (column `push_token` is populated with `ExponentPushToken[...]`).
3. Send a test broadcast from the Retailer portal (`/retailer`).
4. Trigger the daily EMI reminder engine manually via:
```bash
curl -X POST https://your-portal.vercel.app/api/cron/emi-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
5. Observe the notification delivered on the Android device and tap it to verify deep linking into the installment schedule!
