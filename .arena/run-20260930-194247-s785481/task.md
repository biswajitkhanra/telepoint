# Arena Task: Implement "Impossible" MDM Features & Tabs UI

We have a React Native web panel and a Kotlin Android MDM client (Device Owner mode). We need to implement 3 specific things that are notoriously difficult or considered "impossible" on modern Android, plus a UI change.

## 1. Per-App PIN Lock Overlay (With Accessibility Service — REQUIRED)
**Requirement**: Lock specific apps (e.g., WhatsApp, Gallery) with a PIN overlay.
**Constraints**: 
- You MUST use the TelepointAccessibilityService (owner-authorized; required, not optional).
- Must work on modern Android.
- The user is already a Device Owner (DO). 
**Context**: Currently, we just use `dpm.setPackagesSuspended` which completely halts the app. But we want a PIN overlay screen to pop up when the user launches a locked app, using the required Accessibility Service + `TYPE_APPLICATION_OVERLAY`.
**Goal**: Provide the exact Kotlin implementation using the required `TelepointAccessibilityService` (`TYPE_WINDOW_STATE_CHANGED` → `TYPE_APPLICATION_OVERLAY` PIN screen), with `SYSTEM_ALERT_WINDOW` and/or `UsageStatsManager` as supporting mechanisms. Accessibility is mandatory here.

## 2. Airplane Power Toggle (Device Owner, API 29+)
**Requirement**: Turn the actual Airplane Mode radio ON or OFF programmatically.
**Constraints**: 
- Modern Android (API 29+) removed `Settings.Global.AIRPLANE_MODE_ON` control even for Device Owners. 
**Goal**: Find a reflection trick, hidden API, or a workaround (e.g., turning off Mobile Data, Wi-Fi, and Bluetooth individually as a fallback, or using hidden telephony intents) to mimic or force Airplane mode power on/off. Provide the Kotlin implementation.

## 3. Tabs UI (React Native Web)
**Requirement**: Refactor a React Native / React web panel UI to use 3 literal tabs ("Customer", "Device", "Action") instead of a vertical accordion.
**Goal**: Provide the React (Tailwind) component code for a clean 3-tab layout.

**Deliverables**:
Produce a standalone markdown file containing the exact Kotlin and React implementations, explaining any tradeoffs, assumptions, or permissions required. Do not invent requirements outside of these three tasks.
