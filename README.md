# مدار — MADAR Life OS

The current development branch adds a durable encrypted PostgreSQL workspace, Arabic RTL management screens, scoped AI conversations and read-only Notion record synchronization. See [the implementation, migration, security boundaries and remaining live checks](docs/durable-workspace.md).

## Development

Requires Node.js 24 and npm 11.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run security:check
npm run dev
```

The application requires its existing private owner/database configuration before access. Set values securely using the blank `.env.example` or Preview environment settings; never commit secrets. Initialize only the approved Preview internal database with `npm run notion:store:init`. No real database migrations or Notion operations ran during implementation.

New workspaces start empty. Database-backed records replace automatic demo/browser-only state. Older local records remain available for explicit recovery in Settings. Themes stay local; service credentials and imported Notion records do not.

Browser tests use an isolated disposable PostgreSQL fixture and synthetic records:

```sh
npm run build
MADAR_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Use `npx playwright install chromium` if system Chromium is unavailable. Existing setup guides: [owner boundaries](docs/single-owner.md), [AI configuration](docs/ai-assistant.md), [Notion metadata discovery](docs/notion-discovery.md). Legacy Notion write-back is disabled on this read-only development branch.

## Preview only

Vercel root directory is the repository root (`./`), framework Next.js, Node 24. Existing owner authentication remains required until a verifiable passwordless identity boundary is configured. Deployment Protection must remain enabled. Do not merge or deploy to main/Production. Live integration and Preview validation require authorized service access; fixture tests do not establish those outcomes.
