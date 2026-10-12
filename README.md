# مدار — MADAR Life OS

Current single-owner hardening: [Arabic setup, data boundaries, recovery and licensed font support](docs/single-owner.md). Branding uses navy `#14243D` and red `#B71C32`. No real integrations or automatic deployment are enabled by this change.

An Arabic-first personal operating system built on the existing Next.js App Router application. The `/` route retains three client-side destinations: Today, Spaces, and Assistant. No second project is introduced. The dashboard retains synthetic demo records, but the whole site now requires persisted private owner authentication. Discovery, AI drafts and controlled Notion synchronization use secure server APIs and an encrypted internal PostgreSQL store.

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

`npm test` runs 85 demo-model, AI/voice, read-only SDK, controlled sync, single-owner authorization, boundary and SQL-store tests. TypeScript strict mode is enabled. TypeScript 5.9 is used because the installed typescript-eslint parser does not support TypeScript 7.

Browser tests run against the production build:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

For an installed system Chromium, use `MADAR_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. The runner starts the app on port 3100 with an isolated temporary PostgreSQL-protocol fixture on 55431 and real authenticated session checks. All external-service credentials are blanked; no production authentication bypass exists. Tests cover shared task completion, overdue rescheduling, capture and note conversion, proposal editing/approval/rejection, theme persistence, mobile overflow/navigation, keyboard focus, and automated accessibility checks. Screenshots are written to `/tmp/madar-screenshots`.

Review notes and captured screenshots: [redesign review](docs/redesign-review.md).

## Product and design

- **Today:** three priorities, appointments, overdue items, proposal awaiting approval, quick capture, and captured ideas.
- **Spaces:** Work (Ministry, Stardust, Al Salam Studio), Learning (Studies, Reading, Courses), and Personal (Health and Habits, Personal Life). All eight original spaces remain usable.
- Every space has overview, projects, tasks, calendar and notes. Shared records are selected by `spaceId`, not copied per view.
- Reading and courses include illustrative specialized summaries. Health and Habits includes a functional session-only habit checkbox.
- **Assistant:** authenticated configurable production AI, Arabic microphone capture/transcription and editable typed proposals. Approve stores an internal draft; a separate Notion sync review is required before any external write.
- **Notion Sync:** explicitly approved source/property scopes and exact single-record payloads, stable-ID deduplication, optimistic conflict checks, encrypted action journal and read-only recovery. Existing writes stay locked until the current connection passes a disposable create/update test.
- **Notion Discovery:** private metadata-only audit and user-approved internal source mapping; requires secure server configuration. No Notion writes or data migration.
- Light/dark themes, self-hosted Tajawal Arabic font, accessible focus states, modal focus containment, keyboard tabs, mobile bottom navigation, and global capture.

Design tokens live in `app/tokens.css`: colors, font, spacing, radius, and layout widths. Components use these shared tokens. The Tajawal font is bundled through `@fontsource`, so no Google Fonts request is needed.

## Demo data and private backend boundary

All `/` demo records are synthetic and remain in React session memory. Reload resets tasks, notes, habits, proposals and conversations. Only the theme preference persists in localStorage (`madar-theme`). The fixed example day is 11 October 2026 and is explicitly marked as a demo. Demo records are never automatically sent to AI or Notion. Private AI works only with explicit external-processing consent and owner-confirmed actual context. Controlled Notion writes have a separate source/action approval workflow and report verified results honestly. No sensitive real records are included in sample data.

The reducer in `app/lib/model.ts` is the single source of truth for tasks, notes, and proposals. Note-to-task conversion retains the record ID and removes the note. Proposal decisions are idempotent: repeated approval cannot create duplicate tasks. Static example projects and appointments are read-only.

## Vercel

The app lives at the **repository root** (`package.json`, `app/`, and `vercel.json` are siblings). Set **Root Directory** to `./` or leave it empty, **Framework** to Next.js, and **Node.js** to 24.x. The committed configuration uses `npm ci` and `npm run build`; retain the default output directory. The site requires private authentication/store environment variables before access. AI, read-only discovery and separate Notion sync integrations require their respective server-only configuration; see the guides below.

This redesign is intended for feature-branch review. Do not merge to `main` or deploy to production without explicit approval.

## Private Notion discovery

The subordinate `/discovery` workflow adds owner authentication, metadata-only read-only Notion inventory, Arabic audit/mapping review and encrypted PostgreSQL configuration. The official SDK is pinned to 5.27.0 and API 2026-03-11. It cannot write to Notion or read page bodies/rows. All Notion AI ingestion is disabled, including Ministry and Health. Synthetic dashboard functionality is preserved behind the site-wide login.

[Secure setup, permissions, environment variables and exact read-only verification](docs/notion-discovery.md). No secrets are requested in chat. The feature is fail-closed until its private server configuration is supplied; real Notion access was not tested during implementation.

### Private AI assistant and Arabic voice

The existing assistant tab now supports a server-configured real AI provider and Arabic microphone recording/transcription. It requires private owner authentication and explicit external-processing consent. All proposals remain encrypted internal drafts; approval never writes to Notion or changes demo tasks/calendar. Ministry/health destinations and all Notion AI ingestion are excluded. Daily planning uses only owner-confirmed actual records. Provider and hosting usage may incur fees.

See [safe setup, environment variables, privacy boundaries and verification](docs/ai-assistant.md). No live API keys or real workspace data are needed to run the automated tests.

### Controlled Notion synchronization

`/sync` adds scoped create/update approval, stable IDs, conflict review, status/history, bounded manual retries and read-only recovery. It cannot delete/archive/merge/migrate or change schemas. Before existing-mode writes, the server must verify a disposable create/update cycle in a separately approved test source. No live account was accessed during implementation.

[Setup, permissions, real test steps, reliability limits and recovery plan](docs/notion-sync.md). Production deployment and main merging require explicit owner approval.
