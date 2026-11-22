# Development

For people working on Local Console itself. To run and use it, see the [README](../README.md).

## Setup

Requires Node.js 24+ and Docker.

```bash
npm install
docker compose up -d floci   # Floci only
npm run dev:server           # terminal 1: API on :3701
npm run dev:web              # terminal 2: UI on :5173 (proxies /api and /aws to :3701)
```

Checks: `npm run typecheck` · `npm test` (unit tests of `server/` and `web/`)

Integration, E2E, UI, UX and mobile suites run against a running console: see [tests/README.md](../tests/README.md).

## Project layout

```text
server/   Node API: proxies /aws to Floci, /api for what AWS has no API for (Redis keys, RabbitMQ, health)
web/      React + Cloudscape UI
  src/registry.ts        every service is one entry: sidebar, router and search read from it
  src/services/<id>/     one folder per service (pages, components, hooks, routes)
  src/shared/            layout, shared components and hooks
tests/    black-box suites against a running console (it, e2e, ui, ux, mobile)
docs/superpowers/        design specs, plans, roadmap
```

Adding a service = one folder in `web/src/services/` and one entry in `registry.ts`. How a service goes from spec to release: [roadmap, section 7](superpowers/roadmap.md). Main design: [docs/superpowers/specs/2026-11-09-localconsole-design.md](superpowers/specs/2026-11-09-localconsole-design.md).

## Traps & open issues

- **SNS email / SMS subscriptions never deliver on Floci.** `Subscribe` with `sms` or `email` succeeds but stays `PendingConfirmation` (`ConfirmSubscription` rejects any token), and `Publish` to the topic writes nothing to the SMS inbox or the SES mailbox (checked 2026-11-21). The subscription modal only offers SQS / Lambda / HTTP(S). Publishing straight to a phone number (SNS › SMS) works.
- **"Other senders" blocks scan the browser-side.** Queue / topic / function pages list S3 notifications, Lambda async destinations, trigger on-failure destinations and SES configuration sets that point at them, by listing buckets, functions and configuration sets when the page opens (`web/src/services/integrations/senders.ts`). Fine for a local Floci; slow with hundreds of functions.
- **An SES configuration set sends to the default event bus only.** `CreateConfigurationSetEventDestination` with another bus ARN fails (`EventBridgeDestination EventBusArn must be a valid default event bus ARN`), the same as on AWS. The destination modal lists only `default`; catch the events with a rule on it for source `aws.ses`. Reading an identity with no default set returns no `ConfigurationSetName`, so the hook stores `""` (React Query rejects `undefined`).
- **`/api` and `/aws` only answer the console itself.** `server/src/middleware/localOnly.ts` rejects (403) requests from another site (`Sec-Fetch-Site`) and foreign `Host` headers (DNS rebinding). Open the console via `localhost`, `127.0.0.1` or `[::1]`; any other hostname gets 403. `/api/health` stays open for Floci's probe. Floci's own port `4566` is not covered.
- **Each service's pages load lazily (`lazyPage` in `web/src/shared/lazyPage.ts`).** The first page loads ~1.7 MB JS (gzip ~400 KB) and ~0.9 MB CSS, down from 3 MB / 1.3 MB; a service's SDK and pages load when you open it. Keep it that way: a new service's routes use `lazyPage`, and nothing in `registry.ts` or the shared layout may import a service's SDK hooks (that would pull its SDK back into the main bundle). Served uncompressed: compression skipped while the console is localhost-only.
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
- **Recently visited services live in the browser** (`localStorage`, key `localconsole:recent-services`, `web/src/shared/recentServices.ts`), like the colour mode (`localconsole:color-mode`). Private windows or blocked storage just start empty every time.
- **"Reset data" (Console Home) calls Floci's `POST /_floci/state/reset`.** It wipes every service in every region, including the SES mailbox and SMS inbox, and stops Lambda containers. Floci 2.4.0 leaves Valkey (ElastiCache) and RabbitMQ (MQ) containers running with no record left; `docker compose restart floci` removes them, so the modal shows that command (checked on a throwaway Floci, 2026-11-20). Tests never call the real endpoint: `e2e/home.spec.ts` mocks it with `page.route`. Never try it against a Floci holding data you care about.
- **Step Functions quirks in Floci 2.4.0.** The Steps table is built from `GetExecutionHistory` (`web/src/services/stepfunctions/steps.ts`, fixtures of real histories in `web/test/services/stepfunctions/fixtures/`). `Wait` and `Retry` are cut at 30 s. A Distributed Map emits no iteration events, so it shows as one row. When a Map iteration fails, Floci attaches both `MapIterationAborted` and `MapIterationFailed` to the first iteration, so the console takes the error of the failing step inside. The `Fail` state has no exit event: its error comes from `ExecutionFailed`. A Map or Parallel with more than 20 children is collapsed on load. Deleting a state machine leaves its executions in Floci: create one with the same name again and the old executions are listed, and `StartExecution` with an old execution name fails with `ExecutionAlreadyExists` (checked 2026-11-22), so use fresh names in tests. A rule target for a state machine needs no `RoleArn`; a schedule target does (the console sends the default role).
- **EventBridge patterns in Floci 2.4.0.** `numeric`, `wildcard` and array values in events never match, in `TestEventPattern` and in real routing; `PutRule` accepts a pattern that isn't JSON, so the console checks it itself. There is no `ListRuleNamesByTarget`, so "which rules point at this queue" has to scan every bus. A schedule's expression isn't in `ListSchedules`, only in `GetSchedule`.
