# Android Neo-Fintech 3D Immersive & Fluid Motion UI/UX Specification

**Date**: 2026-09-07  
**Scope**: Strictly Android Mobile Application (`/mobile`) — Zero modifications to Web App.  
**Inspiration**: CRED, Jupiter, Fi Money, Revolut, PhonePe neo-fintech design systems.  
**Author / Committer**: `biswajitkhanra <biswajit.khanra82@gmail.com>`  
**Repository**: `https://github.com/biswajitkhanra/telepoint`

---

## 1. Objectives & Architectural Guardrails

1. **Fluid Butter-Smooth Motion**:
   - Hardware-accelerated transitions via React Native's `Animated` with `useNativeDriver: true`.
   - Spring physics on touch-down/touch-up across all cards, buttons, and list items (`scale: 0.96` on touch, spring release with `friction: 6, tension: 50`).
   - Staggered entry cascade on initial screen render and pull-to-refresh.
   - Ambient pulsing glow on upcoming/due EMI banners and CTAs.

2. **3D Depth & Neo-Fintech Visuals**:
   - Deep Obsidian/Graphite background (`#080B11`), dark titanium card bodies (`#0E131F`, `#131927`).
   - High-contrast multi-layer border sheen: 1px border with `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.02)`.
   - Metallic holographic foil sheen overlays using `LinearGradient`.
   - **Telepoint Official Brand Mark**: Native SVG implementation of Telepoint's official navy rounded tile (`#1b3e7d` to `#0a1f44`), electric-blue orbital swoosh, satellite beacon, and 3D faceted "T" glyph. Also generated as crisp Android app icons and splash art.
   - Neo-fintech color hierarchy:
     - **Emerald Mint (`#10B981`, `#34D399`)**: Paid status, verified KYC, completed steps.
     - **Electric Indigo & Sapphire (`#4F46E5`, `#3B82F6`)**: Primary actions, active highlights.
     - **Cyber Amber (`#F59E0B`, `#FBBF24`)**: Dues within 5 days, pending installments.
     - **Crimson Red (`#EF4444`, `#F87171`)**: Overdue warnings, late fines.

3. **Persistent Forced Login Architecture**:
   - Once a customer logs in with Aadhaar/Mobile, the session is permanently written to `AsyncStorage` (`@telepoint_customer_session`).
   - The app stays permanently locked into the authenticated state across app closes, system reboots, and network dropouts.
   - Background refreshes fail gracefully without evicting the customer session.
   - The user remains logged in permanently until they explicitly clear the app's storage in Android Settings ("Clear Data") or confirm a guarded sign-out.

4. **Strict Web Isolation**:
   - Zero changes to `/app`, `/components`, `/lib`, `/pages`, or web config.
   - Web application remains 100% as-is.

---

## 2. Component Suite (`mobile/src/components/`)

### 2.1 `TitaniumLoanCard.tsx`
- **Visuals**: Brushed dark titanium finish with metallic highlight gradient, embossed gold micro-chip, and high-gloss 3D bezel.
- **Data**: Device model (e.g., iPhone 15 Pro / Galaxy S24), loan status badge, masked IMEI (`•••• •••• 9812`), loan account number, and retailer partner badge.
- **Interactivity**: One-touch copy for IMEI and Loan ID with haptic confirmation and smooth floating toast.

### 2.2 `EmiProgressRing.tsx`
- **Visuals**: Smooth visual progress gauge showing installment amortization.
- **Data**: EMIs paid vs total (`X / Y Paid`), percentage complete pill, total paid vs total remaining amount.
- **Motion**: Animated progress fill on screen load with spring easing.

### 2.3 `QuickActionDock.tsx`
- **Visuals**: Floating 4-button quick action dock with frosted glass backgrounds.
- **Actions**:
  1. **⚡ Instant UPI**: Direct deep link to installed UPI apps (`upi://pay?...`) with retailer VPA and amount.
  2. **🧾 Statements**: Jumps directly to paid installment receipts.
  3. **📞 Call Store**: Direct dialer shortcut to the retailer store manager.
  4. **ℹ️ Help & FAQ**: Clear explanations of EMI due dates, fines, and support.

### 2.4 `ReceiptModal.tsx`
- **Visuals**: Bank-grade digital payment receipt slip with decorative jagged or scalloped edge styling, green verified checkmark crest, and metallic badge.
- **Data**: Installment number, amount paid, due date, payment date, UTR / reference, IMEI, and retailer name.
- **Actions**: "Done" dismiss and "Share Receipt" action.

### 2.5 `Card3D.tsx` & `EmiHeroCard.tsx` (Enhanced)
- Upgraded with tactile spring touch feedback, multi-stop neon gradients, live countdown tags, and glowing repayment buttons.

---

## 3. Screen Overhauls (`mobile/src/screens/`)

### 3.1 `LoginScreen.tsx`
- Ambient glowing background orb with obsidian glassmorphic card.
- Floating input field for Aadhaar / Mobile number with dynamic digit formatting and numeric keypad.
- Multi-loan selector with 3D device preview cards for returning customers.
- Biometric authentication simulation toggle ("Quick Biometric Unlock").

### 3.2 `DashboardScreen.tsx`
- Top header with customer name, KYC verified shield, and retailer badge.
- Live store announcement banner (if active) with glowing amber beacon.
- Titanium 3D Loan Passbook Card.
- Repayment Progress Gauge.
- Next EMI Urgency Hero Card with live days countdown and breakdown of principal, fine, and first EMI charge.
- Quick Action Dock (UPI, Receipts, Call Store, Help).
- Recent installment activity ledger with tap-to-view receipt.

### 3.3 `EmiScheduleScreen.tsx`
- Sliding segmented filter pill: `[All]`, `[Pending]`, `[Completed]`.
- Vertical timeline stepper with glowing progress connectors:
  - Green checkmark + "PAID" badge + payment date.
  - Amber clock + "DUE IN X DAYS" countdown tag.
  - Red alert badge + "OVERDUE" with late fine breakdown.
- Tap any completed installment to open the digital bank-grade `ReceiptModal`.

### 3.4 `BroadcastsScreen.tsx`
- Neo-fintech magazine-style deal cards with rich tags (*Festival Offer*, *Store Notice*, *Discount*).
- Tap-to-expand image modal with smooth zoom and share option.

### 3.5 `ProfileScreen.tsx`
- Customer identity card with avatar initials and loan account ID.
- Security Shield Hub: Device encryption status, Expo push token synchronization badge, and biometric lock status.
- Retailer Store Hub: Store address, manager contact, and direct phone link.
- Secure session sign-out with confirmation dialog.

---

## 4. Verification & Deployment Pipeline

1. **Mobile Typecheck**: `npm run typecheck` in `mobile/` must pass with 0 errors.
2. **Web Regression Gate**: `npm test` and `npm run build` in root must pass with 0 errors, proving zero impact to the web app.
3. **Step-by-Step GitHub Upload**:
   - Clean git commit authored by `biswajitkhanra <biswajit.khanra82@gmail.com>`.
   - Direct push to `origin/main` at `https://github.com/biswajitkhanra/telepoint.git`.
