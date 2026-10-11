# مدار — MADAR Life OS

An Arabic-first personal operating system built on the existing Next.js App Router application. The `/` route retains three client-side destinations: Today, Spaces, and Assistant. No second project or backend is introduced.

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

`npm test` runs eight state-model tests. TypeScript strict mode is enabled. TypeScript 5.9 is used because the installed typescript-eslint parser does not support TypeScript 7.

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
- **Notion Discovery:** expandable future-feature description and illustrative relationship map. No Notion access or data changes.
- Light/dark themes, self-hosted Tajawal Arabic font, accessible focus states, modal focus containment, keyboard tabs, mobile bottom navigation, and global capture.

Design tokens live in `app/tokens.css`: colors, font, spacing, radius, and layout widths. Components use these shared tokens. The Tajawal font is bundled through `@fontsource`, so no Google Fonts request is needed.

## Data boundary

All records are synthetic and remain in React session memory. Reload resets tasks, notes, habits, proposals and conversations. Only the theme preference persists in localStorage (`madar-theme`). The fixed example day is 11 October 2026 and is explicitly marked as a demo. No API keys, databases, AI services, Notion calls, analytics, or personal/government/health records are used. No action claims to save to Notion.

The reducer in `app/lib/model.ts` is the single source of truth for tasks, notes, and proposals. Note-to-task conversion retains the record ID and removes the note. Proposal decisions are idempotent: repeated approval cannot create duplicate tasks. Static example projects and appointments are read-only.

## Vercel

The app lives at the **repository root** (`package.json`, `app/`, and `vercel.json` are siblings). Set **Root Directory** to `./` or leave it empty, **Framework** to Next.js, and **Node.js** to 24.x. The committed configuration uses `npm ci` and `npm run build`; retain the default output directory. No environment variables are required.

This redesign is intended for feature-branch review. Do not merge to `main` or deploy to production without explicit approval.
