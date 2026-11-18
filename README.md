# Local Console

An AWS-Console-style web UI for local development, built on [Floci](https://github.com/floci-io/floci) (local AWS emulator) and [Cloudscape](https://cloudscape.design).

## Run

Requires Docker Desktop (Windows/macOS) or Docker Engine (Linux).

```bash
git clone <repo-url> localconsole
cd localconsole
docker compose up --build
```

- Console: http://localhost:3701
- Floci (point your app here): http://localhost:4566

Reset all data: `docker compose down -v`

## Point your app at Floci

```env
AWS_ENDPOINT_URL=http://localhost:4566   # app runs on your machine
# AWS_ENDPOINT_URL=http://floci:4566     # app runs inside the same docker compose
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=ap-southeast-1
```

The console and your app must use the same region (default `ap-southeast-1`, the parent region of the Hanoi Local Zone). To use another region:

```bash
# bash
AWS_REGION=ap-northeast-1 docker compose up --build
```

```powershell
# PowerShell
$env:AWS_REGION="ap-northeast-1"; docker compose up --build
```

## Development

Requires Node.js 24+.

```bash
npm install
docker compose up -d floci   # Floci only
npm run dev:server           # terminal 1: API on :3701
npm run dev:web              # terminal 2: UI on :5173 (proxies /api and /aws to :3701)
```

Checks: `npm run typecheck` · `npm test`

Design: [docs/superpowers/specs/2026-11-09-localconsole-design.md](docs/superpowers/specs/2026-11-09-localconsole-design.md)

## Traps & open issues

- **`/api` and `/aws` only answer the console itself.** `server/src/middleware/localOnly.ts` rejects (403) requests from another site (`Sec-Fetch-Site`) and foreign `Host` headers (DNS rebinding). Open the console via `localhost`, `127.0.0.1` or `[::1]`; any other hostname gets 403. `/api/health` stays open for Floci's probe. Floci's own port `4566` is not covered.
- **Bundle is large (open):** JS ~2.2 MB, CSS ~1.3 MB, served uncompressed — 6 perf FAILs in [tests/REPORT.md](tests/REPORT.md) §10. Next step: `lazy()` each service's routes so a page only loads its own service. Compression skipped while the console is localhost-only.
- **Logo `<img>` has no `width`/`height` (2 perf WARNs, won't fix):** Cloudscape `TopNavigation` renders it and its `logo` prop only takes `src`/`alt`; `mark.svg` already has a fixed size and layout shift is 0.
- **E2E fails on any `console.error` (`tests/e2e/fixtures.ts`).** The only exceptions are S3's 404 for a bucket without lifecycle/tags (`?lifecycle`, `?tagging`): S3 answers "not configured" with 404, the app shows it as empty, but the browser still logs the request. Don't widen the filter; avoid the error instead (e.g. Lambda Monitor checks `DescribeLogGroups` before `FilterLogEvents`).
- **SQS peek needs a region header.** `GET /aws/_aws/sqs/messages` (Floci-only) looks the queue up in Floci's default region unless an `Authorization` header names the console region (`web/src/services/sqs/peek.ts`; signature is not checked).
