# MADAR durable workspace development

This branch is based on `feature/persistent-workspace-foundation` at `3adba4c` (the head of draft PR #2), which extends `feature/single-owner-boundaries` at `5bb1bbe`. No changes target main or Production.

## Storage and recovery

The authenticated `/api/workspace` endpoint reads/writes an AES-GCM encrypted schema-version-1 workspace in a separate `madar_workspace` PostgreSQL table. A monotonic SQL revision implements atomic compare-and-swap; simultaneous stale writers receive 409 instead of overwriting another device. Authentication, exact Origin/CSRF checks, persistent rate limits, payload limits and private/no-store responses apply. No hostname grants access.

The table is an additive migration in `scripts/private-store.sql`. Run `npm run notion:store:init` only against the approved **Preview internal database**, using its securely configured existing `DATABASE_URL`. Existing private state, keys and Notion records are not rewritten. Re-running initialization preserves existing workspace rows. Unsupported stored versions fail closed and are not replaced with demo data. Retain a database backup before future schema/encryption-key migrations; changing the encryption key does not migrate old ciphertext.

New workspaces start empty. Tasks, notes, projects, events, goals, daily habit dates, custom spaces and week-start preferences use the database. The theme remains a suitable local preference. The previous `madar-workspace-v1` localStorage key stays untouched: Settings provides an explicit export/review/import path; it is never automatically seeded into the database. JSON recovery imports add missing records and reject changed duplicate IDs. Current preferences are preserved.

Automatic saves are serialized, display pending/error status and retry transient failures with bounded exponential delays. A failed or interrupted commit is reconciled by revision and exact snapshot before treating it as saved. Conflict recovery keeps pending edits in memory and offers an explicit download; it never silently overwrites newer data. Unsaved edits trigger a navigation warning. Browser crashes before database confirmation can still lose in-memory edits; they are never shown as saved. Each request is capped at 64 KiB and each collection at 1,000 records. Failed saves remain visible; this is a bounded workspace document, not a large-data database model.

## Product surfaces

Arabic RTL dashboard statistics and a bounded recent-activity summary (the last 50 changes) are computed from actual workspace records. Task management provides list/board/date-group views, dates, priority, status, editing, deletion and project links. Projects show related-task completion; notes support create/edit/search/delete and capture conversion. Calendar supports day/week/month navigation with events and dated tasks. Habits, measured goals and user-defined spaces persist. Existing fixed compartments retain their AI/Notion security boundaries; custom spaces do not gain external AI permissions.

## AI and speech

`/api/conversation` reuses the configured server-side AI provider, owner authentication and explicitly approved per-area context. Arabic/Syrian-dialect conversation history is encrypted and scoped per area. Sequential requests use a history revision and last-request ID; completed duplicate requests do not bill a second provider call. Provider failures do not fabricate replies. At most 200 messages are retained without silent trimming; the last 40 are sent as conversational context. AI never directly changes workspace or Notion records. Draft creation remains a separate review action; after approval the owner can explicitly copy its title/date into workspace records, with a separate confirmation. Full draft details remain in the encrypted draft.

Audio recording/transcription retains the existing bounded, cancellable, consent-gated server implementation. Reviewed text can be sent into the conversation. Optional speech output uses an available Arabic device voice; missing browser/voice support has a text fallback. Raw recordings are not persisted. This is a turn-based record/review/reply experience, not streaming realtime voice. Live microphone/provider/Arabic voice availability requires testing on the owner's supported device.

## Notion read synchronization

`/api/notion-records` uses the existing read-only token only after an explicit title-property mapping/record-read approval. Its separate official-SDK transport permits exactly the selected source's query and no writes, schema changes, page-body reads or unrelated destinations. The old metadata-discovery transport remains unchanged.

Imported titles/timestamps stay encrypted in a separate server-side snapshot, never localStorage or AI context. They cannot replace user workspace records. Stable page IDs deduplicate updates, older remote timestamps cannot replace newer snapshots, pagination and successful-cycle watermarks persist, and failures preserve checkpoints with backoff. Mapping changes and stale revisions are rejected. The last successful cycle and pending/error status are visible. Each scope is capped at 2,000 records, and oversized results fail visibly. Remote deletions are not automatically propagated; earlier imported titles remain retained.

Opt-in automatic polling runs while the dashboard is open and visible, approximately every five minutes after completion, with resumable 50-row batches. No unattended cron service is claimed or enabled; Vercel plan entitlements have not been inspected. Legacy write-back is disabled by the production sync-context factory on this branch, even if previous write acknowledgement variables exist. A future write-back release requires a separate permissions/mapping/conflict review.

## Authentication and Preview

Existing owner authentication and secrets are reused; no new password is generated. Hostname-based Preview bypasses have been removed from pages, login and the client guard because private records now exist. Vercel Deployment Protection remains untouched. Passwordless visitor authentication needs a verifiable trusted identity boundary; Deployment Protection/branch hostname alone is insufficient. Until that boundary is available, existing owner authentication is required.

Required current bindings: `DATABASE_URL`, `MADAR_APP_ORIGIN` (exact Preview origin), `MADAR_OWNER_PASSWORD_HASH`, `MADAR_SESSION_SECRET`, `MADAR_STORE_ENCRYPTION_KEY`. AI and Notion retain the existing documented optional server bindings. Never paste values in chat or commit them. No live values were available during local development.

Build and tests use Node 24/npm 11. `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run security:check`; browser coverage uses `MADAR_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. All browser databases are disposable; no external service secrets or real records are used. Genuine owner-login/browser security checks use fixture credentials only. Refer to PR validation for executed results; real Preview readiness, Notion reads, live AI replies and actual microphone/audio output remain separate checks.
