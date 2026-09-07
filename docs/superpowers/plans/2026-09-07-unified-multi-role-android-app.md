# Unified Multi-Role Android Application & Live Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Telepoint Android mobile app (`/mobile`) into a single, unified APK serving Customers, Retailers, and Admins with a premium light neo-fintech aesthetic ("not dark color"), super-fluid animations, first-time role onboarding with persistent memory, full live Supabase web portal integration for staff, and instant multi-loan switching for borrowers.

**Architecture:** Single React Native + Expo 51 APK featuring a first-time role gateway (`@telepoint_device_role`). Customers enter a light pearl 3D neo-fintech presentation layer with spring touch physics and instant multi-loan switching. Staff (Retailer / Admin) enter an embedded native shell (`react-native-webview`) connecting directly to the live Next.js + Supabase production portal (`/login`, `/retailer`, `/admin`) with native navigation, fast account switching, and zero database changes.

**Tech Stack:** React Native 0.74.5, Expo 51, `react-native-webview`, `react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `@react-native-async-storage/async-storage`, `lucide-react-native`.

**Spec:** [`docs/superpowers/specs/2026-09-07-unified-multi-role-android-app-design.md`](file:///d:/telepoint/docs/superpowers/specs/2026-09-07-unified-multi-role-android-app-design.md)

## Global Constraints
- **Visual Style:** Premium light neo-fintech ("not dark color") — pure pearl white (`#FFFFFF`, `#F8FAFC`), deep slate text (`#0F172A`), royal blue (`#2563EB`) and emerald (`#10B981`) accents.
- **Scope Isolation:** Only modify files in `mobile/` and tests. Zero changes to web application (`app/`, `components/`, `lib/`).
- **Live Supabase Backend:** Preserve all live database schemas, Supabase Auth user structures, and live endpoints.
- **Committer Identity:** `biswajitkhanra <biswajit.khanra82@gmail.com>`.
- **Target Git Remote:** `https://github.com/biswajitkhanra/telepoint.git` (`origin/main`).

---

### Task 1: Premium Light Neo-Fintech Tokens & Role Storage Keys

**Files:**
- Modify: `mobile/src/config.ts`
- Test: `test/mobile-theme.test.mjs`

**Interfaces:**
- Consumes: None.
- Produces: `THEME` (light palette), `STORAGE_KEYS.DEVICE_ROLE`, `STORAGE_KEYS.ACTIVE_LOAN`.

- [ ] **Step 1: Update `test/mobile-theme.test.mjs` to verify light palette and role keys**

```javascript
// test/mobile-theme.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('THEME configuration contains light neo-fintech tokens and role storage keys', () => {
  const config = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(config.includes('#F8FAFC') || config.includes('#FFFFFF'), 'Must include light canvas');
  assert.ok(config.includes('#0F172A'), 'Must include deep slate text');
  assert.ok(config.includes('#2563EB'), 'Must include royal blue');
  assert.ok(config.includes('DEVICE_ROLE'), 'Must include DEVICE_ROLE storage key');
  assert.ok(config.includes('ACTIVE_LOAN'), 'Must include ACTIVE_LOAN storage key');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mobile-theme.test.mjs`

- [ ] **Step 3: Update `mobile/src/config.ts`**

Update `THEME` to light neo-fintech tokens:
- `bg.darkest`: `#F8FAFC`
- `bg.card`: `#FFFFFF`
- `bg.cardElevated`: `#FFFFFF`
- `bg.surface`: `#F1F5F9`
- `bg.border`: `rgba(15, 23, 42, 0.08)`
- `text.primary`: `#0F172A`
- `text.secondary`: `#334155`
- `text.muted`: `#64748B`
- Add `STORAGE_KEYS.DEVICE_ROLE` and `STORAGE_KEYS.ACTIVE_LOAN`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mobile-theme.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/config.ts test/mobile-theme.test.mjs
git commit -m "feat(mobile): configure light neo-fintech tokens and role storage keys"
```

---

### Task 2: First-Time Role Onboarding Screen & Role State Management

**Files:**
- Create: `mobile/src/screens/RoleSelectionScreen.tsx`
- Modify: `mobile/src/context/AuthContext.tsx`
- Test: `test/mobile-role-onboarding.test.mjs`

**Interfaces:**
- Consumes: `STORAGE_KEYS.DEVICE_ROLE` from `config.ts`.
- Produces: `deviceRole` state (`'customer' | 'staff' | null`), `setRolePreference(role)` function.

- [ ] **Step 1: Write test for role onboarding and persistence**

```javascript
// test/mobile-role-onboarding.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Role onboarding screen exists and AuthContext manages device role', () => {
  assert.ok(fs.existsSync('mobile/src/screens/RoleSelectionScreen.tsx'), 'RoleSelectionScreen must exist');
  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(auth.includes('deviceRole'), 'AuthContext must expose deviceRole');
  assert.ok(auth.includes('setRolePreference'), 'AuthContext must expose setRolePreference');
  assert.ok(auth.includes('STORAGE_KEYS.DEVICE_ROLE'), 'Must persist role to AsyncStorage');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mobile-role-onboarding.test.mjs`
Expected: FAIL

- [ ] **Step 3: Create `RoleSelectionScreen.tsx` & update `AuthContext.tsx`**
  - `RoleSelectionScreen`: 3D light pearl cards with Telepoint logo for Customer vs Retailer/Admin selection.
  - `AuthContext`: restore `deviceRole` on boot, persist choice to `AsyncStorage`, and expose `setRolePreference`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mobile-role-onboarding.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/RoleSelectionScreen.tsx mobile/src/context/AuthContext.tsx test/mobile-role-onboarding.test.mjs
git commit -m "feat(mobile): add first-time role onboarding and persistent device role state"
```

---

### Task 3: Install `react-native-webview` & Implement `StaffPortalScreen.tsx`

**Files:**
- Modify: `mobile/package.json`
- Create: `mobile/src/screens/StaffPortalScreen.tsx`
- Test: `test/mobile-staff-portal.test.mjs`

**Interfaces:**
- Consumes: `PORTAL_BASE_URL` from `config.ts`, `react-native-webview`.
- Produces: `StaffPortalScreen` with native controls, live Supabase portal access, and role switcher.

- [ ] **Step 1: Install `react-native-webview` in `mobile/`**

Run: `cd mobile; npx expo install react-native-webview`

- [ ] **Step 2: Write test for StaffPortalScreen**

```javascript
// test/mobile-staff-portal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('StaffPortalScreen integrates WebView and native header controls', () => {
  assert.ok(fs.existsSync('mobile/src/screens/StaffPortalScreen.tsx'), 'StaffPortalScreen must exist');
  const screen = fs.readFileSync('mobile/src/screens/StaffPortalScreen.tsx', 'utf8');
  assert.ok(screen.includes('WebView'), 'Must render WebView');
  assert.ok(screen.includes('PORTAL_BASE_URL'), 'Must point to portal base url');
  assert.ok(screen.includes('Switch to Customer'), 'Must have customer switch shortcut');
});
```

- [ ] **Step 3: Implement `StaffPortalScreen.tsx`**
  - Clean light-themed native header: Telepoint logo, Back, Forward, Refresh, Sign Out / Switch User, and Switch to Customer Mode.
  - High-performance `WebView` with cookies enabled and pull-to-refresh.

- [ ] **Step 4: Run test and mobile typecheck**

Run: `node --test test/mobile-staff-portal.test.mjs`
Run: `cd mobile; npm run typecheck`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/screens/StaffPortalScreen.tsx test/mobile-staff-portal.test.mjs
git commit -m "feat(mobile): add StaffPortalScreen with embedded live Supabase portal and native header"
```

---

### Task 4: Customer Multi-Loan Account Switcher in `AuthContext` & `DashboardScreen`

**Files:**
- Modify: `mobile/src/context/AuthContext.tsx`
- Modify: `mobile/src/screens/DashboardScreen.tsx`
- Modify: `mobile/src/screens/ProfileScreen.tsx`
- Test: `test/mobile-multi-loan.test.mjs`

**Interfaces:**
- Consumes: `MultiLoanCustomer` from `types`, `allLoans` state in `AuthContext`.
- Produces: `switchActiveLoan(loanId)`, interactive bottom sheet device selector in Dashboard and Profile.

- [ ] **Step 1: Write test for multi-loan switching**

```javascript
// test/mobile-multi-loan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Customer multi-loan switching logic is implemented', () => {
  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(auth.includes('allLoans'), 'AuthContext must track all loans for customer');
  assert.ok(auth.includes('switchActiveLoan'), 'AuthContext must support switching active loan');

  const dashboard = fs.readFileSync('mobile/src/screens/DashboardScreen.tsx', 'utf8');
  assert.ok(dashboard.includes('switchModalVisible') || dashboard.includes('Switch Financed Device') || dashboard.includes('Switch Device'), 'Dashboard must have loan switch UI');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mobile-multi-loan.test.mjs`

- [ ] **Step 3: Implement multi-loan switching in `AuthContext.tsx`, `DashboardScreen.tsx`, and `ProfileScreen.tsx`**
  - Store `allLoans` on customer login.
  - Add `switchActiveLoan` to swap customer profile and loan installments instantaneously.
  - Render an interactive loan selector bottom sheet in Dashboard and Profile.
  - Add "Switch App Mode (Customer / Staff)" in Profile.

- [ ] **Step 4: Run test and mobile typecheck**

Run: `node --test test/mobile-multi-loan.test.mjs`
Run: `cd mobile; npm run typecheck`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit**

```bash
git add mobile/src/context/AuthContext.tsx mobile/src/screens/DashboardScreen.tsx mobile/src/screens/ProfileScreen.tsx test/mobile-multi-loan.test.mjs
git commit -m "feat(mobile): add customer multi-loan account switcher and role toggle"
```

---

### Task 5: Refactor All Components and Screens to Premium Light Theme ("Not Dark Color")

**Files:**
- Modify: `mobile/src/components/Card3D.tsx`
- Modify: `mobile/src/components/TitaniumLoanCard.tsx`
- Modify: `mobile/src/components/EmiProgressRing.tsx`
- Modify: `mobile/src/components/QuickActionDock.tsx`
- Modify: `mobile/src/components/ReceiptModal.tsx`
- Modify: `mobile/src/components/EmiHeroCard.tsx`
- Modify: `mobile/src/screens/LoginScreen.tsx`
- Modify: `mobile/src/screens/EmiScheduleScreen.tsx`
- Modify: `mobile/src/screens/BroadcastsScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`
- Modify: `mobile/app.json` (set `userInterfaceStyle: "light"`, `backgroundColor: "#F8FAFC"`)

**Interfaces:**
- Consumes: `THEME` light tokens from `config.ts`.
- Produces: 100% light pearl neo-fintech mobile interface with super-fluid spring physics.

- [ ] **Step 1: Refactor components to pure light pearl surfaces**
  - `Card3D`: Pure white `#FFFFFF`, soft shadow (`shadowColor: '#0F172A', shadowOpacity: 0.06`), border `rgba(15, 23, 42, 0.08)`.
  - `TitaniumLoanCard`: Pearl silver finish with royal blue accents and crisp charcoal text.
  - `EmiProgressRing`: Crisp white surface, soft gray background ring, vivid emerald progress stroke.
  - `QuickActionDock`: Alabaster pill container, vibrant colored circular action icons.
  - `ReceiptModal`: Clean bank-grade white slip with perforated styling and verified green badge.
  - `EmiHeroCard`: Crisp white card, royal blue urgency button, high contrast text.

- [ ] **Step 2: Refactor screens and navigation**
  - `LoginScreen`: Alabaster canvas, clean card, dark text.
  - `EmiScheduleScreen`: Light timeline stepper with green/amber/slate chips.
  - `BroadcastsScreen`: Light card feed with vibrant tags.
  - `RootNavigator`: Light frosted tab bar with dark slate icons and active royal blue tint. Handles `deviceRole === null ? RoleSelection : deviceRole === 'staff' ? StaffPortal : CustomerFlow`.

- [ ] **Step 3: Run mobile typecheck and all unit tests**

Run: `cd mobile; npm run typecheck`
Run: `npm test`
Expected: PASS with 0 errors

- [ ] **Step 4: Commit**

```bash
git add mobile/src/ mobile/app.json
git commit -m "feat(mobile): overhaul full UI/UX to premium light neo-fintech theme and fluid motion"
```

---

### Task 6: End-to-End Verification, App Icons & Step-by-Step GitHub Upload

**Files:**
- Modify: `mobile/assets/icon.png`, `adaptive-icon.png`, `splash.png`
- Modify: `scripts/generate-brand-icons.ps1`

- [ ] **Step 1: Regenerate crisp light-theme splash and icons if needed**
- [ ] **Step 2: Run mobile typecheck (`npm run typecheck` in `mobile/`)**
- [ ] **Step 3: Run full root test suite (`npm test`)**
- [ ] **Step 4: Run Next.js web build (`npm run build`)** to guarantee zero web regressions
- [ ] **Step 5: Push to GitHub (`origin/main`)**
  - Verify `git status` clean and branch up to date.
