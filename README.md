# مدار — Life OS

Phase 1 of a personal Life OS: an Arabic, RTL, responsive dashboard built with Next.js App Router, TypeScript, Tailwind CSS, and Lucide icons.

## Run locally

Requires Node.js 24 and npm 11 (validated environment).

```sh
npm ci
npm run dev
```

Production validation and startup:

```sh
npm run build
npm run typecheck
npm run start
```

## Features

- **اليوم**: daily priorities, completion progress, two demo events, quick capture, and space summaries. Captured notes can be converted into tasks.
- **المساحات**: eight life areas, search, and demo project details.
- **المساعد الذكي**: conversational UI with local, deterministic planning suggestions. This is a demo, not a connected AI model.
- **Notion Discovery**: disconnected placeholder with a demo discovery notice. No Notion credentials, API calls, or access to existing data.
- Responsive sidebar and mobile navigation, Arabic labels, RTL document, and keyboard focus indicators.

All data is synthetic. Changes exist only in React memory and reset on reload. No backend, database, authentication, or external AI integration is configured. The displayed date is a fixed demo date. Spaces and project counts are illustrative.

## Deploy on Vercel

The application lives at the **repository root**: `package.json`, `package-lock.json`, `app/`, and `vercel.json` are siblings. `/workspace/life-os` is the local checkout directory, not a nested application directory in GitHub.

1. Merge the application pull request into `main` before deploying that branch. The original `main` commit contained only a README; Vercel cannot detect Next.js from that commit.
2. Import `Elhamown/life-os` into Vercel, or open the existing project's Settings → Build and Deployment.
3. Set **Root Directory** to the repository root (`./`, or leave the field empty). Do not set it to `life-os` or `app`.
4. Use the **Next.js** framework preset and **Node.js 24.x**. The committed Vercel configuration uses `npm ci` and `npm run build`. Keep the output directory at the framework default.
5. Deploy the new `main` commit, or the PR branch for a preview. No environment variables or Notion credentials are required.

If “No Next.js version detected” persists, verify that the deployment's selected commit includes the root `package.json` with `next` under `dependencies`, and check the Root Directory again. Redeploying the old README-only commit will reproduce the error.
