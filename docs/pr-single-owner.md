## Single-owner MADAR and safe read-only recovery

An uncertain Notion write previously could not be reconciled after re-auditing or re-approving its source because the entire old scope, including approval timestamps and report identity, had to match. Read-only owner-approved reconciliation now survives those changes and write-disable while enforcing the same source, area, mode and property IDs, current allowlist/mapping and live property types. Old write approvals remain invalid. A reserved terminal journal entry allows recovery without removing history even when the regular journal is full.

- Preserve a single fixed owner identity: no signup, invitations, teams, roles or account-selection APIs. Sessions are HttpOnly/Secure on HTTPS, expire after 30 minutes, remain revocable in the internal store and are invalidated by credential rotation. Strict Origin/Fetch Metadata CSRF checks, persisted rate limits and server-rendered page/API authentication remain enforced.
- AI context/proposals use encrypted per-area slots with authenticated scoped reads, writes and decisions. No context, planning reference or proposal may cross the selected destination. Legacy data remains untouched with filtered reads; Ministry/health remain excluded from external AI. Changing area clears visible private state and consent. Owner-only discovery/sync review is an explicit aggregate, never provider context.
- Navy #14243D and red #B71C32 tokens, light/dark RTL mobile UI and optional local Neo Sans Arabic support. No licensed font files are included; build-time validation prevents activation with missing assets and Tajawal remains the fallback.
- Add route/browser-bundle security checks and read-only CI verification with no secrets, migrations or deployment. Logout now reports failures instead of claiming completion.

## Validation

Typecheck, lint, 85 server/model tests, 20 Chromium browser tests, production build and security:check pass. npm audit --omit=dev reports zero known production vulnerabilities at execution time. Tests cover re-approval/re-audit recovery, revoked boundaries, no replay, full-journal recovery, credential rotation/foreign principals, CSRF, unsupported account routes, encrypted area isolation, actual fixture owner login/logout, area switching and missing font activation. AI/Notion/transcription responses remain synthetic; no real integration was activated.

Arabic setup, limits and pending work: docs/single-owner.md. Synthetic screenshots: docs/screenshots/single-owner-login.png, single-owner-today.png and single-owner-mobile.png.

Review against feature/controlled-notion-sync, the stacked prerequisite branch. Retarget main after prerequisites are reviewed/merged. No main merge or deployment is authorized. This change invalidates older owner cookies; a fresh login is required. Live services, production secrets/TLS permissions, disposable Notion verification, licensed font provisioning and any rollout remain separate owner-approved work.
