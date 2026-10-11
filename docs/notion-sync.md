# Controlled Notion synchronization — MADAR

This extends the existing app and `/discovery` audit; it does not replace working demo screens or AI drafts. `/`, `/discovery` and `/sync` now require the existing persisted owner session **on the server before rendering**, including RSC requests. Only `/login` and static nonsensitive assets are public. Private pages/APIs are no-store/noindex. Setup failures deny access, not fall back to a public dashboard. No production authentication bypass exists.

**No real Notion account was accessed during implementation.** Automated integration tests use disposable PGlite and a synthetic Notion HTTP service with the official SDK. Live verification is a separate explicit operation after your own test database is configured. Existing-mode writes are locked until the server has verified create **and changed update** on a MADAR-created disposable record, using the current connection configuration. The CI tests do not unlock a deployed store.

## Safety contract

- SDK `@notionhq/client` 5.27.0, explicit API `2026-03-11`. Databases are containers; scope uses **data source IDs**, not database IDs.
- Keep the original audit integration **Read content only**. Create a separate internal sync integration with Read content, Insert content and Update content. Disable comments/user access/unneeded capabilities. Share only the selected database containers, first a separate disposable test database. Notion capabilities are integration-wide and sharing can include descendants/sibling data sources: Notion itself does not provide this app's per-source ACL. Review actual sharing; the app enforces a second, narrower data-source/field allowlist in its own transport. The sync token must differ from the audit token.
- A source must be explicitly listed in server configuration, appear as a verified accessible data source in the completed/partial read-only audit, and have an approved mapping for the **same report**. Owner approval then selects exact existing property IDs and their types. Source/mapping/report revision changes invalidate queued scope. Every execution re-reads schema metadata before writing; drift becomes a conflict, never a schema patch.
- No blocks/body reads or writes, schemas, relations, comments, file uploads, templates, icon/cover edits, delete, trash/archive, restore, migrations, bulk merging or bulk updates. The transport denies these even when its integration token has broader Notion capabilities. Each execution affects at most one page and only its explicitly reviewed property payload.
- Ministry and health stay excluded from external AI ingestion. Manual sync may target those areas only under the same explicit source/action approvals; the sync path never invokes an AI provider. All Notion ingestion into AI remains off. Approved AI drafts need a **separate** sync approval showing source, operation, actual page target/parent and exact payload; approving an AI draft alone does not write anything.
- Tokens remain server environment secrets; state, scopes, bindings, proposals, before/after mapped values and action history use the existing AES-256-GCM internal configuration store. Global audit logs contain enum/outcome/count/time/random ID, not titles, payloads, token values or raw SDK errors. Unrelated returned page properties are discarded, and no page blocks are fetched. Full SDK query responses necessarily arrive on the server before minimization.

## Existing schema requirements

Required: an existing `title` property and a **dedicated existing `rich_text` property for the stable record UUID**. No suitable property means this source cannot safely synchronize in this phase. MADAR never adds one. If you choose to change a schema yourself, that is a separate manually authorized activity outside this workflow; re-audit afterward.

Optional existing mappings: details (`rich_text`), date (`date`), kind (`rich_text`) and duration (`number`). Mapping property IDs must be distinct. Date/detail/duration values cannot silently disappear: non-null fields require an appropriate mapping. Kind remains in the internal record/action model and is exported only if its optional mapping is chosen. Select/status/relation/formula/rollup mappings are unsupported here; we never add options or alter schemas to make a record fit.

Input dates are `YYYY-MM-DD` or ISO timestamps with explicit timezone (`2026-10-11T14:00:00+03:00`). AI events retain their draft date/time; the owner supplies the timezone rather than MADAR guessing. Empty UI fields are omitted, preserving existing values. A supplied date sets a start-only date value; existing ranges/formatting are shown in the baseline and must be reviewed because replacement can remove a range end. Rich-text/title updates replace that property's text rather than preserving old annotations. All such replacement values are displayed before approval; page IDs and schemas are unchanged.

## Server environment and internal store

First follow [private authentication/storage setup](./notion-discovery.md). Required server-only variables remain `MADAR_APP_ORIGIN`, `MADAR_OWNER_PASSWORD_HASH`, `MADAR_SESSION_SECRET`, `MADAR_STORE_ENCRYPTION_KEY`, `DATABASE_URL`. Use encrypted deployment environment settings or an ignored `.env.local`; never put secrets in chat, source control, browser storage or `NEXT_PUBLIC_*` variables. Use provider-verified PostgreSQL TLS and a least-privilege runtime DB role, no runtime DDL. Generate owner password hash/independent encryption and session keys locally per the guide.

For a new internal database, `npm run notion:store:init` creates only MADAR's own tables. For an existing private store, have its administrator **review and apply `scripts/sync-audit-upgrade.sql` once** before enabling synchronization. It extends only MADAR's audit event constraint, preserving rows; it never touches Notion or app records. Runtime requests/builds never migrate schemas. Back up the internal database and encryption key securely before rollout.

| Variable | Meaning |
|---|---|
| `NOTION_SYNC_TOKEN` | Secret for the separate sync integration; must not equal `NOTION_DISCOVERY_TOKEN`. |
| `NOTION_SYNC_WRITE_ACK` | `1` only after reviewing integration capabilities and sharing. Default disables writes. |
| `NOTION_SYNC_TEST_ACK` | `1` only after confirming the test database is separate/disposable. |
| `NOTION_SYNC_TEST_SOURCE_IDS` | Comma-separated canonical UUIDs of test **data sources** only. |
| `NOTION_SYNC_WRITE_SOURCE_IDS` | Comma-separated data sources potentially allowed in existing mode; listing them alone enables nothing. |

Lists must be disjoint. Configure intended existing IDs before the test cycle; token or allowlist changes invalidate its evidence. A new token must prove its own create/update capability, not reuse a previous token's creation evidence. Integration capability acknowledgements are deliberate owner statements, not API proof that the token is configured correctly. The app verifies actual accessible source/page membership during operations. UI passwords are owner authentication, never Notion tokens.

## Review workflow and live disposable verification

1. **Do not deploy automatically.** Review the feature PR, configure isolated authenticated preview infrastructure deliberately, and initialize/upgrade only its internal database. Configure the separate Notion test integration/sharing through Notion. Do not share sensitive or existing databases with a test integration unnecessarily.
2. Sign into the site. In `/discovery`, explicitly run a read-only audit and approve mappings for the chosen disposable source (and intended existing sources if authorized). Sources not returned/accessibly verified are unavailable; this is never a complete workspace scan.
3. In `/sync`, select the test source, map only its existing columns, and explicitly approve its source/field scope and disposable status. Create a new UUID once and keep it for retries/recovery. Test titles must start with `اختبار مدار ·`. Do not use genuine information in test fields.
4. Prepare a single create. This only reads schema and queries that stable UUID. Review `POST /v1/pages`, exact parent data-source ID, property IDs/values and digest; check approval and execute. Read-back must verify the stable ID and desired fields before the status says succeeded. Record the new page ID. Repeating the same successful action returns its result without another write.
5. Prepare an update to that **same UUID and returned page ID**, with a different harmless title. Review baseline, exact PATCH target/payload and Notion's concurrency limitation; explicitly approve. Test updates are limited to disposable records created/verified by MADAR. When read-back succeeds, server evidence unlocks eligibility for existing sources, not automatic syncing.
6. Only then select an existing-mode source, approve its scope and prepare/review one record at a time. For an existing page with a blank dedicated stable-ID property, you may explicitly bind a UUID in the approved payload; a different existing stable ID is a conflict and is never replaced. Existing page IDs are retained. Never modify/reset a UUID to bypass uncertainty.
7. Leave test records in place. This implementation does **not** clean up, archive, delete, migrate or merge them. Any cleanup needs separate explicit authorization and tooling outside this workflow.

Optional repeatable **live** integration command (not part of `npm test`, disabled without opt-in):

```bash
# Set locally/securely, never paste values into chat or command arguments:
# MADAR_SYNC_VERIFY_ORIGIN=https://your-authenticated-preview.example
# MADAR_SYNC_VERIFY_PASSWORD=<owner password for this preview>
# MADAR_SYNC_VERIFY_SOURCE_ID=<already approved disposable data_source UUID>
# MADAR_SYNC_LIVE_TEST_ACK=1
npm run sync:test:live -- --execute-disposable-test
```

Read `scripts/notion-sync-live.mjs` first. Invoking this explicitly authorizes its two fixed, harmless **manual test** payloads in the pre-approved test scope. It authenticates to the site, refuses existing-mode sources, prints exact synthetic create/update target/payload/digest, creates one UUID record, verifies an idempotent repeat, changes only that test title on the same page and verifies server test evidence. It never receives the Notion token, never touches other rows and logs out afterward. On uncertainty/conflict it stops; use the UI's read-only reconciliation. Remove temporary verification password environment values afterward. Use the UI steps instead if you want a separate click approval for each payload. Hosting/PostgreSQL/Notion plan features may incur their usual costs; the sync workflow makes no AI calls.

## Reliability and honest limits

- The encrypted journal and approval are atomically persisted with audit entries **before dispatch**, under the existing fenced 90-second workflow lease. The source/record binding, operation, exact payload, baseline and connection fingerprint are part of the approval digest. Server rate limit: 30 sync POST requests per 10 minutes. Per action: 5 explicitly approved attempts, 15-minute review window, 40 history entries; total: 200 actions/20 scopes. No silent history pruning or background retries.
- Deduplication searches **only active rows in the approved data source** using the dedicated stable-ID property. More than one match or further results becomes a duplicate conflict; incomplete query results block writes. We do not scan archived/inaccessible workspace content or assume uniqueness Notion does not enforce. Existing internal bindings prevent recreating missing/trashed bound pages.
- Creates with an exact existing match reconcile without another POST; differing fields become a conflict. Repeated record/action IDs preserve the same binding rather than create duplicates. The app serializes its own writers; unrelated Notion editors/integrations remain outside its control.
- Updates compare the current page's last-edited timestamp and mapped values against the reviewed baseline immediately before PATCH. Known remote changes stop with a before/current/payload review. A post-write read verifies fields and stable ID and can show a read-back conflict. **Notion has no supported atomic conditional update here**: a remote editor can race between check and write, and an overwritten same-field edit cannot always be detected afterward. This is optimistic conflict detection, not a transactional lock. Coordinate edits or defer updates when stronger guarantees are required; the UI requires acknowledging this limitation.
- The SDK retries are off. Reads/writes are paced 400 ms, requests time out after 8 seconds, and responses are stream-capped at 2 MiB. Known 429 responses persist Retry-After and require a new explicit retry. Known rejected/failed requests can renew a read-only preview, then require a fresh payload/baseline approval. No schema or scope override exists.
- Timeout/network/5xx or malformed response **after dispatch** may mean the write committed. The action remains uncertain/writing; it cannot retry writing. Reconciliation only reads by stable UUID or an explicitly supplied page ID in the approved source. A matching result marks success; duplicates/differences require review. Absence is **not** proof of failure because indexing or an in-flight request may lag, so uncertain creation stays quarantined and is never automatically resent.
- PostgreSQL and Notion cannot share a transaction. If persistence fails after a successful write, the durable pre-dispatch journal remains and reconciliation recovers its result. A crash before dispatch may also leave writing status without an actual remote row; the app chooses avoiding duplicates over claiming exactly-once delivery. Do not delete that evidence or blindly replay a create.

## Recovery/rollback plan

1. Stop new approvals. For urgent containment, revoke the sync token or remove its sharing in Notion; set `NOTION_SYNC_WRITE_ACK` off and restart the service through an explicitly approved operational change. Already in-flight requests cannot be recalled. The independent read-only integration remains unaffected.
2. Back up the internal store and encryption key. Inspect encrypted action history through authenticated `/sync`: record/source/page IDs, digest, approved payload, attempts, known failures and last verified success. Global logs remain metadata-only.
3. For `writing`/`uncertain`, wait for an active lease/request to finish and choose **تحقق من النتيجة دون كتابة**. Supply the exact remote page ID if indexing has not exposed it; the server verifies parent source and stable ID. No found result means keep investigating, not retry. Token rotation allows scoped read-only reconciliation but cannot authorize an old write approval or reuse old test proof.
4. For conflict/duplicates, inspect mapped before/current values and candidate IDs. Do not bulk merge or overwrite. If an intentional update is appropriate, prepare a new preview of the current page and explicitly approve that target/payload. No automatic rollback or reverse Notion write is provided: it could overwrite legitimate later edits. Restoring any prior values is a new individually approved action.
5. For known failures, fix permissions/connectivity in the provider dashboard, respect retry time and reapprove. Renew expired failed previews with a read-only refresh. Schema/scope/connection changes need re-audit/reapproval; a new connection needs its own disposable proof before existing writes.
6. Restore a database backup only through separately authorized administration. Preserve encryption keys, stable bindings and dispatch tombstones. **Do not treat restored pending jobs as a runnable queue**; compare remote state and reconcile first. No deployment downgrade should remove page authentication or the independent audit write guard.

## Automated verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
MADAR_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
node --conditions=react-server --import tsx --test tests/notion-sync.test.ts tests/notion-security.test.ts
rg -l 'NOTION_SYNC_TOKEN|NOTION_DISCOVERY_TOKEN|MADAR_AI_API_KEY|MADAR_STORE_ENCRYPTION_KEY|MADAR_SESSION_SECRET|@notionhq' .next/static
# Expected rg exit 1: no server secret identifiers/SDK in browser chunks.
```

74 automated server/unit tests and 16 browser tests cover all existing features plus SDK HTTP transport denial, authenticated access/RSC, exact approvals, complete/partial discovery mapping checks, stable create/update binding, duplicate/conflict detection, uncertain results (including read failures after successful writes), retry timing, connection rotation, encrypted SQL history, audit constraint upgrade and recovery. Browser fixtures start an isolated local PGlite protocol server with real session checks; all AI/Notion tokens are blanked and synthetic UI provider responses are explicitly mocked. Production code has no test-auth bypass.

Screenshots show fixture data only: [desktop](./screenshots/notion-sync-fixture.png), [mobile](./screenshots/notion-sync-mobile-fixture.png). They do not claim live Notion test success.

Feature branch: `feature/controlled-notion-sync`, based on `feature/arabic-ai-assistant`. Review against that parent; retarget main after prior branches are merged. No main merge or automatic production deployment is authorized.
