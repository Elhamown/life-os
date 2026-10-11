# مدار — MADAR Life OS

An Arabic-first personal operating system built on the existing Next.js App Router application. The `/` route retains three client-side destinations: Today, Spaces, and Assistant. No second project is introduced. The public dashboard remains a demo; the subordinate private discovery workflow uses a server-only API and an internal PostgreSQL store.

## Development

Node.js 24.x and npm 11 are validated.

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

`npm test` runs 37 demo-model, read-only SDK, authorization and SQL-store tests. TypeScript strict mode is enabled. TypeScript 5.9 is used because the installed typescript-eslint parser does not support TypeScript 7.

Browser tests run against the production build:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

For an installed system Chromium, use `MADAR_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. The runner starts the app on port 3100. Tests cover shared task completion, overdue rescheduling, capture and note conversion, proposal editing/approval/rejection, theme persistence, mobile overflow/navigation, keyboard focus, and automated accessibility checks. Screenshots are written to `/tmp/madar-screenshots`.

Review notes and captured screenshots: [redesign review](docs/redesign-review.md).

## Product and design

- **Today:** three priorities, appointments, overdue items, proposal awaiting approval, quick capture, and captured ideas.
- **Spaces:** Work (Ministry, Stardust, Al Salam Studio), Learning (Studies, Reading, Courses), and Personal (Health and Habits, Personal Life). All eight original spaces remain usable.
- Every space has overview, projects, tasks, calendar and notes. Shared records are selected by `spaceId`, not copied per view.
- Reading and courses include illustrative specialized summaries. Health and Habits includes a functional session-only habit checkbox.
- **Assistant:** local deterministic responses and structured proposals. Approve creates one local task; edit changes the proposed title, date or space; reject leaves tasks unchanged. Voice is explicitly unavailable and never requests microphone permission.
- **Notion Discovery:** private metadata-only audit and user-approved internal source mapping; requires secure server configuration. No Notion writes or data migration.
- Light/dark themes, self-hosted Tajawal Arabic font, accessible focus states, modal focus containment, keyboard tabs, mobile bottom navigation, and global capture.

Design tokens live in `app/tokens.css`: colors, font, spacing, radius, and layout widths. Components use these shared tokens. The Tajawal font is bundled through `@fontsource`, so no Google Fonts request is needed.

## Data boundary of the public demo

All `/` demo records are synthetic and remain in React session memory. Reload resets tasks, notes, habits, proposals and conversations. Only the theme preference persists in localStorage (`madar-theme`). The fixed example day is 11 October 2026 and is explicitly marked as a demo. The public demo uses no API keys, database, AI service, Notion calls, analytics, or real personal/government/health records. No action claims to save to Notion.

The reducer in `app/lib/model.ts` is the single source of truth for tasks, notes, and proposals. Note-to-task conversion retains the record ID and removes the note. Proposal decisions are idempotent: repeated approval cannot create duplicate tasks. Static example projects and appointments are read-only.

## Vercel

The app lives at the **repository root** (`package.json`, `app/`, and `vercel.json` are siblings). Set **Root Directory** to `./` or leave it empty, **Framework** to Next.js, and **Node.js** to 24.x. The committed configuration uses `npm ci` and `npm run build`; retain the default output directory. The public demo requires no environment variables. Private discovery requires the server-only settings documented below.

This redesign is intended for feature-branch review. Do not merge to `main` or deploy to production without explicit approval.

## Private Notion discovery

The subordinate `/discovery` workflow adds owner authentication, metadata-only read-only Notion inventory, Arabic audit/mapping review and encrypted PostgreSQL configuration. The official SDK is pinned to 5.27.0 and API 2026-03-11. It cannot write to Notion or read page bodies/rows. All Notion AI ingestion is disabled, including Ministry and Health. The existing `/` demo is unchanged.

[Secure setup, permissions, environment variables and exact read-only verification](docs/notion-discovery.md). No secrets are requested in chat. The feature is fail-closed until its private server configuration is supplied; real Notion access was not tested during implementation.
