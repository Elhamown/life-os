## Controlled Notion synchronization

After read-only discovery and approved mappings, owners can review and approve one exact create/update payload in an explicitly approved data source. The existing MADAR dashboard, discovery and AI drafts are preserved; all application pages now require a persisted private owner session before server rendering.

- Separate server-only sync integration and data-source/property allowlists. The original read-only SDK guard remains unchanged. Schema changes, page bodies, delete/archive, merges and bulk operations are denied by the sync transport as well as the API.
- Stable record UUIDs, preserved page IDs, deduplication, optimistic baseline conflict checks and exact target/payload/connection approval digests. AI draft approval alone never authorizes a write.
- Encrypted, fenced dispatch journal, status/last success, bounded owner-approved retries and read-only reconciliation for uncertain outcomes, including successful writes followed by read failures. No automatic create replay after ambiguity.
- Existing sources stay locked until the deployed store verifies a create and changed update in a separate approved disposable test source with the current connection. Test records are never automatically deleted.
- Arabic source-scope, payload, conflict and action-history UI; whole-site login/logout; private secrets and metadata-only global logs. Ministry/health remain excluded from external AI ingestion.

## Validation

- 74 server/unit tests; 21 dedicated sync tests use the official SDK with a synthetic Notion HTTP service, including an encrypted PostgreSQL-compatible store integration and audit constraint upgrade.
- 16 browser tests cover existing UI/Arabic microphone, persisted authentication and RSC denial, consent, conflict review, read-only recovery, mobile layout and accessibility.
- Typecheck, lint and production build pass. Browser static chunks contain no server secret identifiers or Notion SDK.
- Synthetic screenshots: docs/screenshots/notion-sync-fixture.png and notion-sync-mobile-fixture.png.

## Setup and limits

See docs/notion-sync.md for server-only configuration, exact disposable verification steps, optional opt-in live test script, narrow sharing and recovery. Review/apply scripts/sync-audit-upgrade.sql to an existing internal store before enabling sync; runtime never performs migrations.

No real Notion account or production secrets were used, and no live disposable records were created during implementation. Deployed verification remains required and enforced before existing-mode writes. Notion has no atomic conditional update or enforced UUID uniqueness here: remote-editor races cannot be eliminated. Known conflicts stop, ambiguous writes are quarantined; this does not claim transactional exactly-once delivery.

This is a stacked change based on feature/arabic-ai-assistant; review against that parent and retarget main after the prerequisite branches are merged. Do not automatically merge or deploy this change.
