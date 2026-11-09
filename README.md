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
