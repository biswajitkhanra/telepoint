# Unified Multi-Role Android Application & Live Supabase Integration Spec

**Date**: 2026-09-07  
**Scope**: Single Standalone Android APK (`/mobile`) serving Customers, Retailers, and Admins  
**Live Backend**: Supabase PostgreSQL + Supabase Auth + Next.js Live API  
**Author / Committer**: `biswajitkhanra <biswajit.khanra82@gmail.com>`  
**Repository**: `https://github.com/biswajitkhanra/telepoint`

---

## 1. System Overview & Core Requirements

1. **Single Android APK for All Users**:
   - One unified APK file (`com.telepoint.customer`) handles:
     - **Customers / Borrowers**: 3D Neo-fintech EMI dashboard, payments, schedules, receipts.
     - **Retailers / Store Partners**: Store management, loan creation, payment collection & approval, statements.
     - **Admins**: Full platform management, retailer performance, risk analytics, settlement letters.

2. **First-Time Role Onboarding (`RoleSelectionScreen`)**:
   - On cold start, if `@telepoint_device_role` does not exist in `AsyncStorage`:
     - Display a 3D brand onboarding screen:
       - 📱 **"I am a Customer"** *(Financed smartphone, pay EMIs, view receipts)*
       - 🛡️ **"I am a Retailer / Admin"** *(Store owner, sales agent, or admin)*
   - When chosen, `@telepoint_device_role` is **permanently saved** (`'customer'` or `'staff'`) in `AsyncStorage`.
   - The device permanently boots into that role on every subsequent launch until app data is cleared in Android system settings.
   - An intuitive "Switch App Mode" option is available in the profile/header menu to toggle between roles without clearing app data.

3. **Live Supabase Backend Preservation**:
   - The production Supabase database schema (`profiles`, `customers`, `emis`, `retailers`, `customer_app_tokens`) remains 100% untouched.
   - All live web routes, Supabase Auth user mappings, and RLS policies remain completely preserved.

4. **Staff Experience (Retailer & Admin)**:
   - High-performance embedded native portal (`react-native-webview`) connecting to `PORTAL_BASE_URL` (`/login`, `/retailer`, `/admin`).
   - Native shell header with:
     - Back / Forward / Refresh controls.
     - Quick Account Switcher (logs out current session so Admin can log in as Retailer on the same device).
     - Switch to Customer Mode shortcut.

5. **Customer Multi-Loan Account Switcher**:
   - For customers with 2 or more financed devices linked to the same mobile number:
     - Retrieve all active loans from the live Supabase API.
     - Provide an interactive loan switcher bottom-sheet on the dashboard and profile.
     - Switching devices immediately updates the dashboard, next due countdown, amortization ring, and schedule without logging out.
     - Stores the active loan ID in `AsyncStorage` (`@telepoint_active_loan_id`).

---

## 2. Component & Screen Architecture (`mobile/src/`)

### 2.1 `RoleSelectionScreen.tsx` (NEW)
- Visuals: Official Telepoint SVG logo with ambient sapphire halo, obsidian canvas (`#080B11`).
- Card 1: Customer card with smartphone icon, emerald accent, and description.
- Card 2: Staff card with shield icon, sapphire accent, and description.
- Action: Writes to `@telepoint_device_role` and transitions immediately.

### 2.2 `StaffPortalScreen.tsx` (NEW)
- Embedded web container (`react-native-webview`) pointing to `PORTAL_BASE_URL/login`.
- Native header with:
  - Telepoint Logo and live connection indicator.
  - Back, Refresh, and Sign Out buttons.
  - "Switch to Customer Mode" toggle.

### 2.3 Multi-Loan Switcher in `AuthContext.tsx` & `DashboardScreen.tsx` (ENHANCED)
- `AuthContext`:
  - Stores `allLoans: MultiLoanCustomer[]`.
  - `switchActiveLoan(loanId: string)`: Instantly loads the selected loan details and updates persistent session.
- `DashboardScreen`:
  - If `allLoans.length > 1`, shows a glowing "Switch Device" chip on the header and Titanium Card.
  - Bottom sheet allows one-tap switching between financed devices.

### 2.4 Navigation Router (`RootNavigator.tsx`) (ENHANCED)
- Checks:
  1. `deviceRole === null`: Render `RoleSelectionScreen`.
  2. `deviceRole === 'staff'`: Render `StaffPortalScreen`.
  3. `deviceRole === 'customer'`:
     - If not logged in: Render `LoginScreen`.
     - If logged in: Render `MainTabs` (Dashboard, Schedule, Broadcasts, Profile).

---

## 3. Verification & Deployment Pipeline

1. **Dependency Installation**: `react-native-webview` via `npx expo install react-native-webview`.
2. **Typecheck**: `npm run typecheck` in `mobile/` must pass with 0 errors.
3. **Unit Tests**: `npm test` in root must pass with 0 errors.
4. **Web Build**: `npm run build` in root must succeed with 0 regressions.
5. **Git Commit & Push**: Author `biswajitkhanra <biswajit.khanra82@gmail.com>` to `https://github.com/biswajitkhanra/telepoint.git`.
