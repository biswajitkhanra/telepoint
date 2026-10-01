# TelePoint agent instructions

Applies to Codex, Claude, and any agent working in this repository.

1. Before changing code, read `docs/ANDROID_MASTER_CHECKLIST.md` (the full Android checklist every agent must walk and mark) and `checksum.md`, plus `.arena/codex_instructions*.md` when present, `docs/checklist.md`, and `docs/cross_check.md`. Inspect the working tree and preserve other people's edits.
2. Treat `checksum.md` as the current verification ledger. Older documents contain conflicting claims; verify against source, current Android documentation, build logs, and real device evidence. Never repeat a "100% complete" claim without evidence.
3. For every affected checklist item, record implementation, tests, build IDs, and remaining device checks. Unchecked means unfinished, not implicitly approved.
4. Financing protection requires recorded agreement/consent and legitimate Device Owner provisioning. A normal APK installation or Device Admin/accessibility permission does not enroll a Device Owner. Do not fake OS policy success or intercept permission dialogs to force consent.
   - **AccessibilityService is required on this financed phone (customer-consented), not optional:** The TelePoint AccessibilityService **must be implemented** as a first-class component: declared in the manifest and enabled **on the device, by the owner/store, in front of the customer, via the real system toggle** at provisioning. The app does **not** silently or remotely enable it and does **not** restrict the customer's other accessibility services; it only **confirms** the live state (PIN-9088 panel + heartbeat). It is an additional deterrent layer that steers away from uninstall / force-stop / clear-data / Settings tampering while the loan is outstanding, and is disabled on release. Any document or instruction that says accessibility must not be used, is banned, or has been removed is **superseded**: change it to require implementation under these consent rules. Guardrails that still hold: it does not replace Device Owner APIs (Device Owner remains the guaranteed block), it must not be claimed to block a bootloader/recovery wipe. Do not fake OS policy success or intercept permission dialogs to force consent.
5. Keep repayment release, emergency calling, retailer contact, and authorized dispute/support unlock paths working. Never reapply restrictions or execute stale locks for COMPLETE/SETTLED loans. Do not interpret an offline/error response as a new financing authorization.
6. Use supported Android management APIs. Do not claim to block a recovery/bootloader wipe or guarantee delivery while powered off/offline. Read policies back from Android; report failed and unsupported states.
7. Run the relevant tests, web/mobile type checks, native autolinking, and EAS Android build checks. A successful TypeScript check does not compile Kotlin. A queued build is not a successful build. Physical-device acceptance remains pending until actually performed.
8. Update `checksum.md` before handoff. Do not commit secrets, exported customer data, generated build trees, or unrelated workspace instructions. Do not push without user authorization.

## Better Design

For frontend/UI/UX/React Native/Expo work, use the Better Design MCP guidance. Retain the existing design system and Lucide icons for repairs. Start UI builds with `find-design-system`; load `get-ui-principle` and `get-ux-principle`, then review with `get-review-rules` and `check-comprehension`. Use `get-react-native-guide` for native UI when available; report missing tools honestly. Run `inspect-spacing` when a rendered DOM is available. Do not call source review a visual/device test.

<!-- reticle:begin (managed by `reticle init` — edit outside these markers) -->
## Verifying with Reticle

This app is instrumented by **Reticle**, an in-app verification layer exposed as `reticle_*` MCP tools and the `npx @reticlehq/server` CLI (always through npx: Reticle's server is not installed into this project). Verifying is part of "done", not an optional extra.

**Verify when you have changed something a user can see or do.** A component, a form, a route, a request, a piece of state that reaches the screen. Do it BEFORE telling the user it is complete. Reading the diff proves nothing and unit tests do not run the app.

**Do not reach for Reticle when the change cannot show up in the running app.** It costs tool calls and the user's patience, and a verdict over an unrelated flow proves nothing about what you changed. Skip it for: documentation, comments, tests, build config, CI, dependency bumps with no user-facing effect, backend or CLI work with no UI surface, and any change to a project that is not a running web app. Say in one line that you skipped verification and why, rather than silently not doing it.

**How to verify:**

- Drive the flow with `reticle_act_and_wait({ ref, action, until })`. It names the consequence you expect BEFORE the action, which is the difference between a check and a rationalisation.
- Batch a multi-step journey (a login, a form) into one `reticle_act { steps: [...] }` rather than one round trip per field.
- Read the surrounding evidence with `reticle_look { action: "page" | "state" }` and `reticle_observe { action: "network" | "console" }`.
- **Only `reticle_act_and_wait` and `reticle_assert` produce a verdict.** `reticle_act` and everything else move or read the app and prove nothing, so a session ending without one of those two has no result however many tools it used.
- Covered flows: `npx @reticlehq/server gate` reports which recorded flows the changed files affect and whether they still pass.

**Setting Reticle up? You are mid-sequence — do not stop until a verdict exists.** The whole of it
is: instrument the app → get a dev server running → open the app in a browser → drive one flow →
report the verdict. Every step is yours to do, and none of them needs the user. Stopping short leaves an app that
looks installed and can verify nothing, which is the commonest way this goes wrong. `/reticle`
carries the recovery ladder; never report the install as finished without a verdict to point at.

**Nothing connected? Get the app running.**

**A dev server already running when `reticle init` ran does not have Reticle in its bundle.** It read the build config at boot; `init` edited it afterwards. It serves the old bundle and no session appears. In order:

1. **A dev server was already running?** Restart it, then hard-reload the tab. "Something is listening" does not mean the right bundle is served.
2. **Nothing was running?** Start it in the BACKGROUND and say so in one line. `reticle_session { action: "list" }` gives you this project's own dev command in `next_action`; use that, never compose one. Started after `init`, it needs no restart.

Stopping to ask is how a verification turn ends with nothing verified.

Four guards, none optional:

1. **Never run two at once.** One dev server on the app's port. Restarting a stale one means stopping it first, not starting a second alongside it.
2. **Never guess the command.** It comes from `package.json` scripts. No recognisable dev script means say so and stop, not invent one.
3. **Never kill anything you did not start**, and never a daemon or a port holder. The one exception is the restart above, and say in one line that you did it.
4. **The permission prompt belongs to your host.** Never bypass, suppress or auto-approve it, and take a refusal as the answer.

A dev server that is already running does not pick up an edited build config or a newly created plugin file — restart it and hard-reload the tab. And if a server IS listening and still nothing connects, the cause is the SDK not loading in the page, not a missing dev server; do not tell the user to start one they are already running.

**Finish `src/reticle-dev.ts` before you claim setup is done.** `init` writes it and cannot always fill it in: a store that needs an argument only reading the code supplies (Jotai atoms, an XState actor, a TanStack `queryClient`) is left as a commented `registerStore` line. A file that registers nothing looks exactly like a finished one, and `reticle_look { action: "state" }` then returns empty forever — which is indistinguishable from an app that has nothing to report, so it reads as success. Uncomment the line, complete it, and prove it by driving one flow and seeing your keys come back. If `init` told you to restart your client, this is the job waiting for you on the other side of that restart.

**Verify each feature as you finish it, not all of them at the end.** Asked for four, build one, drive it, get a verdict, then start the second. A red verdict after four builds has four suspects; after one it has none.

**Capture what a change is FOR while you are building it, not afterwards.** The business outcome a change is meant to produce is known only while the change is being made. Pass `intent` when a flow is saved, so the saved flow carries the reason it exists. A flow without one replays for months and then reports "step 3 failed" instead of what stopped being true for a user.

**Honesty, which is the whole point:**

- **`verified: "unknown"` is not a pass.** It means Reticle drove the app and could not tell what happened; `verifiedReason` says which clause decided that. Report it as unknown, never as working.
- **`verified: "no-fault"` is not a pass either.** It means nothing was DECLARED to prove: the page settled and no channel complained, but you asserted nothing, so there is no verification. You get it whenever `until` is omitted. Name a consequence the action changes — a signal, a request, a route, or store state — and call again.
- **Never weaken a check to make it green.** Downgrading, skipping or deleting an assertion is a finding, not a fix.
- **If Reticle cannot run** (no daemon, or this is not a running web app), say so. Do not skip verification silently.
- **Setup is not finished until one real flow has been driven and produced a verdict.** `init` exiting 0, the tools appearing, and a session being listed are all things that happen before anything has been verified.

**The `/reticle` skill runs this whole loop for you** — detect, connect, drive one flow, report. If your client does not have it, install it once: `/plugin marketplace add reticlehq/reticle` then `/plugin install reticle@reticlehq` in Claude Code, or `npx skills add reticlehq/reticle` anywhere the skills CLI works.

**A tool you need is missing?** Call `reticle_tools` before assuming it: this surface merges several families behind an `action`, so what looks absent is usually one argument away. It is the verify loop and nothing else on purpose, and a daemon started with `RETICLE_ADVERTISE_ALL_TOOLS=1` advertises the wider set — it reads that at startup, so it takes effect on the next one.

**Report Reticle's own defects with `reticle_session { action: "feedback" }` the moment you notice**, then carry on with your task. You are the user Reticle is built for and the only one who can say what it cost you, and that knowledge is gone when your context is.

📄 **The rest is in [RETICLE.md](./RETICLE.md): what to do when the tools are missing, when a result carries `version_skew` or `update_available`, when `reticle_look { action: "state" }` comes back empty, and how to write a feedback report that can be acted on. Read it when you hit one of those, not before.**
<!-- reticle:end -->
