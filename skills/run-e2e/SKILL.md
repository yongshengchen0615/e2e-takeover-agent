---
name: run-e2e
description: Run visible website E2E tests with admin/client test profiles, human login takeover, and QA/E2E acceptance criteria. Use to test management or user portals, prepare QA acceptance, or verify web functionality.
---

# E2E Takeover Agent

## Activation and limitations

Use for web app E2E testing when a user needs a visible browser, test steps, human takeover, and resume. This skill does not itself create an interactive browser in ChatGPT web. Its bundled MCP server requires local Node.js, installed Playwright and Chromium, and a graphical desktop that supports launching a visible browser. In unsupported remote/cloud-only environments, report the limitation without claiming equivalent browser control.

## Procedure

1. Confirm the target is a permitted test or staging environment. Unless `E2E_ALLOW_REMOTE=1` was configured by the user, only localhost targets are allowed. Warn before any step that might create, change, purchase, send, or delete real data. Never run destructive tests without explicit user approval.
2. Use `e2e_open_dashboard` and share the returned loopback dashboard URL. Explain that the local Chromium window is the interactive browser; the dashboard is a live preview and status panel.
3. Prepare a minimal plan using `goto`, `click`, `fill` (non-sensitive only), `assertVisible`, `assertText`, `assertUrl`, `pauseForLogin`. Prefer data-testid selectors. Never include passwords, OTP, tokens or secrets in plans, selectors, or messages.
4. When login needs verification, use `resumeWhen` with a known post-login path and/or authenticated-only selector. Both constraints must pass before resuming if specified. Do not use a generic public page element as proof of login. For project-specific plans, the dashboard accepts the entire plan JSON object; an array of steps remains supported.
5. For MemberWebsocket-dev, prefer `config/memberwebsocket-dev.smoke.json` for initial **read-only landing-page verification**. The target Netlify site requires explicit remote opt-in on the local host, and LINE LIFF login must not be claimed as verified by homepage checks.
6. Invoke `e2e_start` with `baseUrl` and `steps`. Treat response as started, not completed. Read `e2e_status` for observed status.
7. When state is `manual`, stop driving the browser. Have the user sign in in the same visible Chromium window. No screenshots should be taken in manual mode. Never ask for login credentials in chat. Only call `e2e_resume` when the user explicitly indicates sign-in is complete; clicking dashboard resume is also valid.
8. Verify assertions and final state after resuming. Never loop resume attempts to bypass login.
9. Summarize passed, failed, blocked, not-run tests; separate simulated tests and actual target-website tests.

## QA / E2E acceptance workflow

1. For a user request to "QA / E2E 驗收" or "驗收方式", propose a plan with explicit `acceptance.method = "QA / E2E"` and `criteria`. Each criterion references unique `stepNames` containing at least one assertion, not just navigation or clicks. Specify `required` for release blocking conditions.
2. Start using `e2e_start` and query `e2e_acceptance` or `e2e_status`. Distinguish `passed`, `failed`, `blocked`, `in_progress`, `not_run` and `incomplete`. Never claim approval from a "completed" or passing UI test without checking `accepted:true` and the actual scope.
3. In human takeover mode the acceptance gate must be blocked. Do not trigger `e2e_resume` before the user completes authentication; `resumeWhen` assertions are additional verification, not a permission bypass.
4. Give an acceptance table with ID, requirement, actual evidence, outcome, untested scope and run artifact path. When release gating is requested, run `npm run acceptance:check -- artifacts/report.json` against the real E2E run report; only a verified zero exit code satisfies this local gate, and it does not prove release approval outside covered scope. `artifacts/report.json` is local only; do not claim remote evidence storage or Project status syncing.
5. For MemberWebsocket-dev the four configured criteria only cover public landing-page and entry links. Do not describe LINE login, Supabase RLS, booking writes or project-wide QA as covered without separate confirmed test runs. GitHub Project #5 item/field access currently returns 403; never claim that status was updated.
6. Never mark production release ready solely from an incomplete QA/E2E suite; require actual authorized staging E2E and other appropriate security/integration checks.

## Admin/client test configuration and authorization

1. When the user asks to test management/admin and user/member surfaces, call `e2e_profiles` and select the appropriate profile. Never default to testing only the public homepage when real role testing is requested.
2. Choose `admin-structure` or `client-structure` first for non-destructive *DOM presence* diagnostics. These `assertPresent` checks can pass on logged-out pages and **do not certify login, business functionality, or RLS**.
3. For actual session UI acceptance, choose `admin-auth`, `client-member-auth`, `client-points-auth`, `client-booking-auth`, `client-event-auth`, or `client-calendar-auth`. Use `e2e_start_profile` with `profileId`; optional `baseUrl` is for an authorized custom staging/local origin.
4. Each authenticated profile has an explicit `pauseForLogin` and `resumeWhen` on the correct page/visible main view. Do not enter secrets or use a new browser session. After manual login verify acceptance; only actual completed runs can pass QA.
5. Separate admin and member runs so an admin's browser authorization context cannot be mistaken for a member session; do not use production or user-real transactions for E2E.
6. Profile source lives in `src/profiles.mjs`; UI profile loader uses `/api/profiles` and `/api/profile?id=...`. User can inspect/adjust the generated JSON before starting. References: `docs/ROLE_TEST_PROFILES.md`.
7. Preserve old `e2e_start` / custom JSON behavior and do not claim browser E2E success merely because the profile generator or mock tests passed.

## Failure handling

If Chromium cannot launch or no graphical desktop exists, stop and explain the requirement. If target unreachable, record failure. Never silently remove failed assertions. Do not record auth screenshots or private tokens.

## Output standard

Give dashboard address when available, step-by-step results, pause/resume state, remaining untested scope and reproducibility notes. Never claim installed or connected merely from manifest.
