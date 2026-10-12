# MADAR: private AI assistant and Arabic voice

Single-owner phase: AI context and drafts now use separate encrypted slots per area, with filtered legacy reads and no automatic migration. Status, context and decisions are scoped; model output cannot cross the selected destination. See [Arabic owner policy](./single-owner.md).

Current sync phase: the whole site now requires server-side private authentication. An approved AI draft can be selected in the [separate controlled Notion sync workflow](./notion-sync.md), where a second exact target/payload approval is mandatory. Assistant routes themselves remain draft-only. Current complete suite: 85 server tests and 20 browser tests.

This extends the existing assistant tab on `/`. It preserves the demo dashboard and read-only Notion discovery. No production deployment or external AI/Notion call was performed during implementation. The provider adapter is real; automated responses/transcripts and screenshots use fixtures. You must configure and verify your chosen provider before claiming live service availability.

## What is functional

- Existing single-owner login: salted scrypt password, signed 30-minute HttpOnly/SameSite Strict session, server-side session revocation, Origin checks and persisted login throttling. `/api/ai/*` verifies both JWT and persisted session before operations.
- A server-only OpenAI-compatible HTTPS adapter for Chat Completions **strict JSON schema** and Arabic audio transcription. OpenAI is the default; compatible providers must support both APIs, the chosen models, `store:false` and strict schema. There is no browser API key, endpoint selection or direct provider connection.
- Arabic recording uses `getUserMedia` + `MediaRecorder`, after the user explicitly accepts external processing and presses the microphone button. The browser asks permission. Visible recording, stop/transcribe and cancel; automatic stop after 60 seconds, 4 MiB audio limit. HTTPS is required (localhost is allowed by browsers for development). Supported formats are WebM/Opus, Ogg/Opus or MP4 depending on the browser. Unsupported browsers explain the limitation and retain text input.
- Stop uploads audio for transcription, **not** for proposal generation. The transcript is editable, must be moved to the composer and separately submitted. Cancel/unmount/navigation/logout stops microphone tracks, invalidates pending permission/recording results and aborts pending transcription; no transcript automatically generates an action. Aborting a request cannot recall audio already received by a provider and may not avoid a fee.
- Validated task, event, note and study-session **create-only** proposals: fields, destination, operation and status. Edit, explicitly approve as draft or reject. Approval and rejection are persisted atomically with a privacy-safe audit entry; decided proposals cannot execute twice. No Notion SDK is invoked by the AI routes.
- Private drafts and approved context are encrypted with AES-256-GCM in the existing internal PostgreSQL store. Transcript/audio/conversation are not persisted by MADAR. Suggestions may include text derived from the user's message; draft text is persisted after proposal generation. Approved drafts **do not become dashboard tasks/calendar events or Notion records**. This is intentionally labeled **draft-only**, including when a provider is live. There is no Notion write adapter in the assistant routes; separate sync authorization is described above.
- Daily planning uses only actual records explicitly entered and confirmed by the owner in the private context editor. It never reads demo state or claims a live calendar/Notion task connection. Provider output must contain only authorized IDs; the server renders titles/dates/times from its stored records, rejects unknown IDs, free-text factual assertions and new records in planning mode. Unsaved context changes disable messages and recording until explicitly saved, so removed items are not accidentally sent from the old context. Planning changes no appointments. Tasks retain their supplied dates and events their supplied times.
- Only six non-sensitive destinations are available. Ministry and health records are rejected by server validation for context, messages' destination, audio scope and proposals. **All Notion AI ingestion remains disabled**, including approved mappings. No Notion metadata/schema/report is sent to AI.

## Privacy boundary

Initial consent is unchecked; deployment acknowledgement and request-specific consent are both required. The checkbox explains transmission to an external service, including only the saved authorized context in the selected area for text requests and the recording for transcription. Ministry and health context cannot be included by changing a client payload; stored context is validated again before any external request.

**Area exclusion is not automatic detection of sensitive prose.** Do not paste or dictate ministry/health details into another area. The UI explicitly asks for content without those details. There is no DLP classifier or local transcription service. The server cannot reliably infer sensitivity of unrestricted Arabic text; explicitly approved free text/audio is sent as supplied. Review your provider's processing, retention, region and contractual terms first. `store:false` for chat is not a promise of zero provider retention, and the transcription API may have different retention rules.

The dashboard contains synthetic demo data behind the site-wide private login. Private assistant results are fetched only after authentication and cleared from the interface on logout/session checks (once per minute), or immediately on API authentication failure. This is single-owner authentication, not a multi-tenant authorization system. Do not add genuine sensitive information to demo constants or public static assets. Do not log request bodies, Cookie/Authorization headers or provider payloads in hosting/APM services.

## Safe server setup (never send secrets in chat)

1. Follow [the existing private store and owner authentication setup](./notion-discovery.md). The assistant requires `MADAR_APP_ORIGIN`, `MADAR_OWNER_PASSWORD_HASH`, `MADAR_SESSION_SECRET`, `MADAR_STORE_ENCRYPTION_KEY` and `DATABASE_URL`. Keep `.env.local` ignored and use your deployment's encrypted environment settings for production. `MADAR_APP_ORIGIN` must exactly match the deployed HTTPS origin, without a trailing slash. Preview environments need their own origin and ideally isolated private database/keys.
2. Initialize a **new internal store** with `npm run notion:store:init`. If the previous private tables already exist, the old audit event constraint must be extended once: review and apply `scripts/ai-audit-upgrade.sql` using your internal database administrator/migration tool, **before enabling AI**. This additive constraint upgrade preserves audit rows and does not access Notion. Builds and HTTP requests never run DDL. The runtime database role needs existing SELECT/INSERT/UPDATE/DELETE grants described in the Notion guide, with SELECT/INSERT only on the audit table; no schema privileges.
3. Obtain a separate restricted/budgeted AI provider key through the provider's dashboard. Set these **server-only** environment values (no `NEXT_PUBLIC_` prefix):

| Variable | Meaning |
|---|---|
| `MADAR_AI_API_KEY` | Secret AI key; never enter it in the web UI or chat. |
| `MADAR_AI_EXTERNAL_PROCESSING_ACK` | Set to `1` only after reviewing external processing and billing terms. Otherwise upstream AI is disabled. |
| `MADAR_AI_BASE_URL` | Trusted administrator-configured HTTPS API base; defaults to `https://api.openai.com/v1`. Must expose `chat/completions` and `audio/transcriptions`. Do not use an untrusted proxy. |
| `MADAR_AI_MODEL` | Defaults to `gpt-4.1-mini`; choose a supported strict-structured-output model for your provider/account. |
| `MADAR_AI_TRANSCRIPTION_MODEL` | Defaults to `gpt-4o-mini-transcribe`; choose a model supporting Arabic and multipart JSON transcription. |

The configured hostname is displayed before user consent. Key/model variables are read only by `server-only` code. The Notion token and its permissions are unrelated to AI setup and remain read-only; **do not grant Notion write capabilities**.

4. Start locally with `npm run dev` or review a deployment preview deliberately. Log into the assistant, confirm the provider hostname, add a harmless actual task/calendar fixture through the context editor, and explicitly approve context storage/sharing. Approve external processing separately, then submit a harmless Arabic task/note request. Confirm a typed pending proposal appears. Edit it and approve as draft. Verify the draft persists on refresh, the demo dashboard is unchanged, and Notion is unchanged.
5. Press the microphone only after consent. Grant browser microphone permission, record a harmless short Arabic phrase, stop and wait for transcription. Edit the transcript. Verify it does not generate proposals until submitted. Cancel a second recording; check the browser's microphone indicator stops and no transcription request is sent for the canceled capture. Also navigate away during recording and deny microphone permission to verify recovery.
6. Configure provider budgets/alerts and key scope. Review logs without adding content logging. Test logout and session expiry; future AI requests must fail before contacting the provider. No automatic production deployment is included.

Official API references: [structured outputs](https://platform.openai.com/docs/guides/structured-outputs), [speech to text](https://platform.openai.com/docs/guides/speech-to-text), [API data controls](https://platform.openai.com/docs/guides/your-data). Compatible-provider contracts must be checked independently.

## Limits, errors and cost

Text and transcript: 4,000 characters. Context: 50 records. Maximum 5 proposals/response, 200 stored drafts total; reaching the cap rejects more drafts. Event/study fields require a valid ISO date, 24-hour time and 5–480 minutes. No delete, update, reschedule, bulk operations, arbitrary URLs, unknown fields or unknown context references are accepted from the model. AI calls do not have tool/function execution capabilities.

All owner AI POST operations share a persisted limit of 20 per 10 minutes, including approvals/context changes. Requests are audited before any upstream call; an unavailable audit store fails closed. Audit logs contain event enum, outcome, timestamp, random ID and record count only, never messages/audio/transcripts/titles/keys/raw provider errors. A successful pre-call audit entry means the request was authorized, not that the provider succeeded. Draft storage and approvals use the existing fenced 90-second workflow lease, shared with discovery; conflicting work returns a safe retry message.

Provider timeout: 45 seconds; no automatic billable retry. Output is bounded to 64 KiB and validated independently of the provider's schema. 429, network/timeout, malformed output, refusal/truncation and authentication/configuration failures have safe Arabic feedback. Server multipart uploads are stream-capped before parsing, MIME/magic-byte checked and renamed `capture.<format>` before forwarding. The server enforces byte bounds, while the browser enforces the one-minute capture limit; duration is not decoded on the server. For production billing controls use provider-level quotas, especially for uploaded/altered clients.

Chat token usage and audio transcription may incur provider fees. PostgreSQL, Vercel/other hosting and bandwidth may incur separate fees. This app does not estimate prices or guarantee a spending cap. Provider billing can occur even when a later draft validation/storage step fails or a user cancels an in-flight request.

## Repeatable verification

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
MADAR_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
# Focused server safety tests; no AI/Notion keys or live services needed:
node --conditions=react-server --import tsx --test tests/ai.test.ts tests/notion-security.test.ts
# There must be no server-key identifiers/provider code in browser chunks:
rg -l 'MADAR_AI_API_KEY|NOTION_DISCOVERY_TOKEN|MADAR_SESSION_SECRET|MADAR_STORE_ENCRYPTION_KEY|@notionhq' .next/static
# rg exits 1 when no matches (expected).
```

53 unit tests and 13 browser tests cover the existing dashboard/discovery plus authentication, origins, consent, area exclusion, rate limits, provider failures, actual-context planning, invented references, typed proposals, idempotent decisions, encrypted SQL storage/migration, privacy-safe logs and audio payload bounds. Existing official Notion SDK write-denial tests continue to prove zero upstream writes. AI tests inject a Notion factory which must never be called. Browser tests use actual Chromium MediaRecorder with a synthetic microphone and **mock transcription/model API responses**, including cancellation and denied permission; these prove browser mechanics, not live Arabic transcription accuracy or third-party model quality. No external API key is necessary for tests.

Fixture screenshots: [desktop](./screenshots/ai-assistant-fixture.png), [mobile](./screenshots/ai-assistant-mobile-fixture.png). They depict synthetic records and mocked provider output.

Feature branch: `feature/arabic-ai-assistant`, based on `feature/notion-readonly-discovery`. Review its focused PR against that parent; retarget to main after parent changes are merged. Do not merge or deploy production without owner approval.
