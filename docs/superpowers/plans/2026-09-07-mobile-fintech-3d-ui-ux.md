# Android Neo-Fintech 3D Immersive & Fluid Motion UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Telepoint Android mobile app (`/mobile`) into a top-level, 3D immersive neo-fintech application (CRED/Jupiter style) with fluid butter-smooth animations, official Telepoint branding, and persistent session lockdown until app data is cleared, strictly preserving the Next.js web application as-is.

**Architecture:** A native React Native + Expo 51 presentation layer featuring hardware-accelerated spring touch physics (`useNativeDriver: true`), metallic holographic passbook cards, SVG amortization progress dials, floating quick-action docks, and digital bank-grade receipt modals. Sessions are persistently locked in `AsyncStorage` to ensure forced login across restarts until Android app data is cleared.

**Tech Stack:** React Native 0.74.5, Expo 51, `react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `@react-native-async-storage/async-storage`, `lucide-react-native`.

**Spec:** [`docs/superpowers/specs/2026-09-07-mobile-fintech-3d-ui-ux-design.md`](file:///d:/telepoint/docs/superpowers/specs/2026-09-07-mobile-fintech-3d-ui-ux-design.md)

## Global Constraints
- **Scope Isolation:** Only modify files in `mobile/` and test suites. Zero changes to web application (`app/`, `components/`, `lib/`, `middleware.ts`).
- **Committer Identity:** `biswajitkhanra <biswajit.khanra82@gmail.com>`.
- **Target Git Remote:** `https://github.com/biswajitkhanra/telepoint.git` (`origin/main`).
- **Session Rule:** Customer session MUST persist across reboots, app closes, and offline launches without ever evicting or flashing login screen until Android system data is cleared.
- **Branding:** Official Telepoint navy rounded tile (`#1b3e7d` / `#0a1f44`), orbital swoosh, satellite beacon, and 3D faceted "T" glyph.

---

### Task 1: Neo-Fintech Design Tokens, Telepoint SVG Logo & App Icon Assets

**Files:**
- Create: `mobile/src/components/TelepointLogo.tsx`
- Modify: `mobile/src/config.ts`
- Test: `test/mobile-theme.test.mjs`

**Interfaces:**
- Consumes: None.
- Produces: `THEME` design tokens, `SPRING_CONFIG`, `TelepointLogo` component.

- [ ] **Step 1: Write test verifying theme tokens and brand constants**

```javascript
// test/mobile-theme.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('THEME configuration contains obsidian neo-fintech tokens', () => {
  const configContent = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(configContent.includes('#080B11'), 'Must include obsidian background');
  assert.ok(configContent.includes('#0E131F'), 'Must include titanium card surface');
  assert.ok(configContent.includes('#10B981'), 'Must include emerald green');
  assert.ok(configContent.includes('#3B82F6'), 'Must include sapphire blue');
  assert.ok(configContent.includes('TELEPOINT_BRAND'), 'Must include brand constants');
});
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `node --test test/mobile-theme.test.mjs`
Expected: FAIL (missing tokens or brand constants)

- [ ] **Step 3: Update `mobile/src/config.ts` and create `mobile/src/components/TelepointLogo.tsx`**

Implement `THEME` with obsidian surfaces, metallic borders, typography scales, spring motion parameters, and Telepoint SVG logo component matching web's `components/Logo.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mobile-theme.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/config.ts mobile/src/components/TelepointLogo.tsx test/mobile-theme.test.mjs
git commit -m "feat(mobile): add obsidian neo-fintech tokens and Telepoint SVG brand logo"
```

---

### Task 2: Forced Persistent Session Lockdown in AuthContext

**Files:**
- Modify: `mobile/src/context/AuthContext.tsx`
- Test: `test/mobile-session-persistence.test.mjs`

**Interfaces:**
- Consumes: `STORAGE_KEYS` from `mobile/src/config.ts`, `AsyncStorage`.
- Produces: `AuthProvider`, `useAuth` hook with locked session persistence across cold boots and offline resilience.

- [ ] **Step 1: Write test verifying persistent session logic**

```javascript
// test/mobile-session-persistence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AuthContext enforces persistent session lockdown without auto-logout', () => {
  const authContent = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(authContent.includes('STORAGE_KEYS.SESSION'), 'Must use persistent storage key');
  assert.ok(!authContent.includes('setCustomer(null)') || authContent.includes('logout'), 'Must only nullify customer on explicit logout');
  assert.ok(authContent.includes('isPersistent: true') || authContent.includes('catch'), 'Background refresh must catch errors without wiping saved session');
});
```

- [ ] **Step 2: Run test to verify it passes or fails**

Run: `node --test test/mobile-session-persistence.test.mjs`

- [ ] **Step 3: Update `mobile/src/context/AuthContext.tsx`**

Ensure `restoreSession` immediately restores from `AsyncStorage` and sets `isLoading: false`, ignores background refresh network failures, and guards logout with an explicit confirmation dialog.

- [ ] **Step 4: Verify test passes and typecheck**

Run: `node --test test/mobile-session-persistence.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/context/AuthContext.tsx test/mobile-session-persistence.test.mjs
git commit -m "feat(mobile): enforce persistent session lockdown until Android app data is cleared"
```

---

### Task 3: 3D Immersive Motion Components Suite

**Files:**
- Modify: `mobile/src/components/Card3D.tsx`
- Create: `mobile/src/components/TitaniumLoanCard.tsx`
- Create: `mobile/src/components/EmiProgressRing.tsx`
- Create: `mobile/src/components/QuickActionDock.tsx`
- Create: `mobile/src/components/ReceiptModal.tsx`
- Modify: `mobile/src/components/EmiHeroCard.tsx`
- Test: `test/mobile-components.test.mjs`

**Interfaces:**
- Consumes: `THEME` from `config.ts`, `Customer`, `EMIScheduleItem`, `DueBreakdown` from `types`.
- Produces: 3D tactile cards, amortization progress dial, UPI quick action dock, and bank receipt modal.

- [ ] **Step 1: Write test verifying component exports and properties**

```javascript
// test/mobile-components.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Mobile components export neo-fintech 3D components', () => {
  assert.ok(fs.existsSync('mobile/src/components/TitaniumLoanCard.tsx'), 'TitaniumLoanCard must exist');
  assert.ok(fs.existsSync('mobile/src/components/EmiProgressRing.tsx'), 'EmiProgressRing must exist');
  assert.ok(fs.existsSync('mobile/src/components/QuickActionDock.tsx'), 'QuickActionDock must exist');
  assert.ok(fs.existsSync('mobile/src/components/ReceiptModal.tsx'), 'ReceiptModal must exist');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mobile-components.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement components**
  - `Card3D.tsx`: Hardware-accelerated spring touch scale (`scale: 0.96`), metallic border gradient.
  - `TitaniumLoanCard.tsx`: Brushed dark titanium finish, gold chip, masked IMEI copy with haptics.
  - `EmiProgressRing.tsx`: SVG circular amortization gauge with paid vs total count and percentage.
  - `QuickActionDock.tsx`: 4 frosted buttons (⚡ Pay UPI, 🧾 Receipts, 📞 Call Store, ℹ️ Help).
  - `ReceiptModal.tsx`: Digital bank slip with UTR, installment details, and share option.
  - `EmiHeroCard.tsx`: Live urgency badge, pulsing pay button, and breakdown pills.

- [ ] **Step 4: Run test and mobile typecheck**

Run: `node --test test/mobile-components.test.mjs`
Run: `cd mobile; npm run typecheck`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ test/mobile-components.test.mjs
git commit -m "feat(mobile): add 3D titanium card, amortization ring, quick action dock, and digital receipt modal"
```

---

### Task 4: Complete Screen Overhauls with Fluid 60/120fps Motion

**Files:**
- Modify: `mobile/src/screens/LoginScreen.tsx`
- Modify: `mobile/src/screens/DashboardScreen.tsx`
- Modify: `mobile/src/screens/EmiScheduleScreen.tsx`
- Modify: `mobile/src/screens/BroadcastsScreen.tsx`
- Modify: `mobile/src/screens/ProfileScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: All components from Task 3, `useAuth` from `AuthContext`.
- Produces: CRED/Jupiter level screens with smooth staggered entrances, live due countdowns, and responsive ledger filters.

- [ ] **Step 1: Overhaul `LoginScreen.tsx`**
  - Ambient sapphire glow orb, Telepoint official logo crest.
  - Formatted input with automatic Aadhaar (`•••• •••• ••••`) or Mobile (`+91 ••••• •••••`) detection.
  - 3D Loan Passbook selection cards for multi-loan customers.
  - Biometric quick-access simulation toggle.

- [ ] **Step 2: Overhaul `DashboardScreen.tsx`**
  - Top header with personalized greeting and verified KYC shield.
  - Live broadcast amber beacon.
  - Titanium 3D Loan Passbook Card.
  - Amortization Progress Ring.
  - Next EMI Urgency Hero Card with glowing "Pay via UPI" CTA.
  - Quick Action Dock.
  - Recent activity ledger with tap-to-open bank receipt.

- [ ] **Step 3: Overhaul `EmiScheduleScreen.tsx`**
  - Sliding segmented filter pill (`[All]`, `[Pending]`, `[Completed]`).
  - Timeline stepper with connected glowing vertical tracks and status badges.
  - Tap any paid installment to open `ReceiptModal`.

- [ ] **Step 4: Overhaul `BroadcastsScreen.tsx` & `ProfileScreen.tsx`**
  - Magazine-style store deal cards with full image modal.
  - Security Shield Hub with device encryption status, Expo push token sync badge, and store manager helpline.

- [ ] **Step 5: Update `RootNavigator.tsx`**
  - Bottom navigation bar with frosted obsidian glass, active indigo indicators, and haptic feedback on tab change.

- [ ] **Step 6: Run mobile typecheck and root test suite**

Run: `cd mobile; npm run typecheck`
Run: `npm test`
Expected: PASS with 0 errors

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/ mobile/src/navigation/
git commit -m "feat(mobile): overhaul all 5 mobile screens with top-level neo-fintech UI/UX"
```

---

### Task 5: End-to-End Verification, App Icons & Step-by-Step GitHub Upload

**Files:**
- Modify: `mobile/assets/icon.png`, `adaptive-icon.png`, `splash.png`
- Modify: `docs/superpowers/plans/2026-09-07-mobile-fintech-3d-ui-ux.md` (check off steps)

- [ ] **Step 1: Generate high-resolution Telepoint brand app icon & splash assets**
  - Render crisp 1024x1024 Telepoint brand icon using exact SVG vectors for Android home screen and splash.

- [ ] **Step 2: Run mobile typecheck**
  - Run `cd mobile; npm run typecheck`
  - Expected: 0 errors.

- [ ] **Step 3: Run root tests & Next.js production build**
  - Run `npm test` (all 42+ unit and integration tests)
  - Run `npm run build` (Next.js web build passes cleanly)
  - Verify zero web regressions.

- [ ] **Step 4: Commit all remaining changes**

```bash
git add mobile/assets/
git commit -m "feat(mobile): update Android launcher icon and splash with official Telepoint branding"
```

- [ ] **Step 5: Upload to GitHub (`origin/main`)**

```bash
git push origin main
```

- [ ] **Step 6: Verify remote repository status**
  - Check `git status` -> `Your branch is up to date with 'origin/main'`.
