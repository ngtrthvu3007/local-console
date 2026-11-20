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
# AWS_ENDPOINT_URL=http://localhost.floci.io:4566   # app runs inside the same docker compose
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=ap-southeast-1
```

To receive SNS messages on an HTTP endpoint of an app running on your machine, subscribe `http://host.docker.internal:<port>/...`: from inside Floci, `localhost` is Floci itself. The app must confirm the subscription (call the `SubscribeURL` of the `SubscriptionConfirmation` message) before it receives anything.

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
- **Floci doesn't clean up references.** Deleting a function, queue or topic leaves S3 notification rules, SNS subscriptions and Lambda triggers pointing at it. The console shows them as "(not found)" (`Link` components probe the target), the S3 properties tab offers "Remove broken rules" (S3 rejects every save while one exists), the queue / table trigger lists offer "Remove broken triggers" (`BrokenTriggersAlert`), and the delete modals warn first (`useReferencedNames`). Deleting a function also deletes its queue/stream triggers by default: Floci keeps them, and they run again if a function with the same name is created. Deleting a DLQ makes Floci drop the source queue's failed messages for good.
- **Floci accepts integrations AWS rejects; the console blocks them instead:** overlapping S3 notification filters for the same event type (`overlappingRule`), a second trigger for the same queue/stream and function (`ALREADY_TRIGGERED`), standard topic → FIFO queue and FIFO topic → Lambda/HTTP subscriptions. Anything created outside the console (CLI, IaC) can still have them. Probing a deleted target makes the browser log a 400/404 `console.error`, so an E2E that deliberately leaves dangling references needs an exception like the S3 one above.
- **MQ queues/exchanges don't load in dev mode on macOS/Windows.** Floci returns the broker's `ConsoleURL` as the RabbitMQ container's Docker IP (`http://172.x.x.x:15672`). The console in `docker compose` reaches it; `npm run dev:server` on the host can't (Docker Desktop doesn't route container IPs), so `/api/mq` answers 502 `BrokerUnavailable` and `it/mq.test.ts` times out. Run the console with `docker compose up --build -d console` (keep `npm run dev:web` for the UI) when working on MQ. Linux hosts route container IPs and are fine.
- **The first use of some services downloads more images.** `docker compose up` pulls Floci itself (~270 MB). Floci then pulls on demand: the Lambda runtime on the first invoke (Node.js ~440 MB), Valkey on the first ElastiCache cluster (~130 MB), RabbitMQ on the first MQ broker (~270 MB). That first call is slow, and fails offline.
- **When Floci is down, every page except Home shows "Floci isn't running"** with the start command (`Unavailable.tsx`); the page underneath stays mounted (hidden), so unsaved edits survive. With `npm run dev:web` and no API server, it shows "Can't reach the console server" instead.
- **MQ quirks come from Floci, not the console.** `RebootBroker` returns success without restarting the container (the console only asks for confirmation). The RabbitMQ container is published on `0.0.0.0`, not `127.0.0.1` like Redis, on the first free port of 5672–5699 (it may be 5673) and 15672–15699.
- **SNS text messages can't be deleted one by one.** Floci's `DELETE /_aws/sns` only clears the SMS inbox of every region; unlike SES's `DELETE /_aws/ses`, it takes no `?id=` (by design: the endpoint is a test helper), so the SMS page only has "Delete all" (with a warning), and the SMS tests never clean up after themselves (`it/leftovers.mjs` only lists them). `GET /_aws/sns` does accept `?phone=` and `?id=`.
- **`awslambda-<region>-tasks` bucket.** Floci creates it with the first function and it shows in the S3 bucket list; the console doesn't hide it.
- **ElastiCache "Created" and node status show "—"** because Floci doesn't return them.
- **URLs Floci returns use `localhost.floci.io` (`FLOCI_HOSTNAME` in `docker-compose.yml`).** SQS queue URLs, ElastiCache endpoints, SNS `SubscribeURL`… must work on the host, in this compose and in Lambda containers, and AWS SDK v3 sends SQS calls to the queue URL's host. `localhost.floci.io` resolves to `127.0.0.1` through public DNS, the compose network gives Floci that alias, and Floci's own DNS answers it for Lambda containers. **Offline, or on networks that block DNS answers pointing at `127.0.0.1`, the host can't resolve it:** add `127.0.0.1 localhost.floci.io` to `/etc/hosts`. With the old `localhost` URLs, SQS from a Lambda or a compose app failed with `ECONNREFUSED`.
- **SQS peek needs a region header.** `GET /aws/_aws/sqs/messages` (Floci-only) looks the queue up in Floci's default region unless an `Authorization` header names the console region (`web/src/services/sqs/peek.ts`; signature is not checked).
