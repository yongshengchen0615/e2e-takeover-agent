---
name: run-e2e
description: Run visible, locally hosted website E2E tests, hand browser control to the user when login/2FA/CAPTCHA is required, and resume automation using the same browser session. Use for requests to test a web app with live preview and manual takeover.
---

# E2E Takeover Agent

## Activation and limitations

Use for web app E2E testing when a user needs a visible browser, test steps, human takeover, and resume. This skill does not itself create an interactive browser in ChatGPT web. Its bundled MCP server requires local Node.js, installed Playwright and Chromium, and a graphical desktop that supports launching a visible browser. In unsupported remote/cloud-only environments, report the limitation without claiming equivalent browser control.

## Procedure

1. Confirm the target is a permitted test or staging environment. Unless `E2E_ALLOW_REMOTE=1` was configured by the user, only localhost targets are allowed. Warn before any step that might create, change, purchase, send, or delete real data. Never run destructive tests without explicit user approval.
2. For profile-based runs, first call `e2e_profiles` to discover configured management/client targets and account aliases. Never infer that example localhost URLs are real or that accounts exist. Select `targetId` and optional `accountId` only from returned values; LINE and test_account logins both require human takeover. A test account username is not a credential and never request/store passwords. Use `e2e_open_dashboard` and share the returned loopback dashboard URL. Explain that the local Chromium window is the interactive browser; the dashboard is a live preview and status panel.
3. Prepare a minimal plan using `goto`, `click`, `fill` (non-sensitive only), `assertVisible`, `assertText`, `assertUrl`, `pauseForLogin`. Prefer data-testid selectors. Never include passwords, OTP, tokens or secrets in plans, selectors, or messages.
4. Invoke `e2e_start` with `targetId`, optional `accountId` and optional `steps`, or the legacy `baseUrl`/`steps` plan. Multiple clients are selected and run one at a time with a fresh browser context; `device: mobile` emulates a 390 × 844 viewport. Treat response as started, not completed. Read `e2e_status` for observed status.
5. When state is `manual`, stop driving the browser. Have the user sign in in the same visible Chromium window. No screenshots should be taken in manual mode. Never ask for login credentials in chat. Only call `e2e_resume` when the user explicitly indicates sign-in is complete; clicking dashboard resume is also valid.
6. Verify assertions and final state after resuming. Never loop resume attempts to bypass login.
7. Summarize passed, failed, blocked, not-run tests; separate simulated tests and actual target-website tests.

## Failure handling

If Chromium cannot launch or no graphical desktop exists, stop and explain the requirement. If target unreachable, record failure. Never silently remove failed assertions. Do not record auth screenshots or private tokens.

## Output standard

Give dashboard address when available, step-by-step results, pause/resume state, remaining untested scope and reproducibility notes. Never claim installed or connected merely from manifest.
