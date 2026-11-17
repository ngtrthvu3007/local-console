import { test as base, expect, type Locator } from "@playwright/test";

export { expect };

export const TOUCH_TARGET_PX = 44;

// Nút nhìn có thể nhỏ hơn 44px; vùng chạm do ::after nới ra. Đo bằng hit-test 4 điểm cách tâm 21.5px.
export const hasTouchTarget = async (locator: Locator) => {
  return locator.evaluate((element, size) => {
    // elementFromPoint trả null ngoài viewport: đưa nút ra giữa màn hình trước khi đo
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const reach = size / 2 - 0.5;
    return [
      [x, y - reach],
      [x, y + reach],
      [x - reach, y],
      [x + reach, y],
    ].every(([px, py]) => element.contains(document.elementFromPoint(px, py)));
  }, TOUCH_TARGET_PX);
};
export const resourceName = `mobile-resource-${"long-name-".repeat(4)}test`;
const configuration = {
  FunctionName: resourceName,
  Runtime: "nodejs22.x",
  Handler: "index.handler",
  FunctionArn: `arn:aws:lambda:ap-southeast-1:000000000000:function:${resourceName}`,
  CodeSize: 128,
  MemorySize: 128,
  LastModified: "2026-11-16T00:00:00Z",
  PackageType: "Zip",
};
const table = {
  TableName: resourceName,
  TableStatus: "ACTIVE",
  ItemCount: 2,
  TableArn: `arn:aws:dynamodb:ap-southeast-1:000000000000:table/${resourceName}`,
  KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
  BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
};

// Browser regression fixtures only: no resources are created or changed in Floci.
export const test = base.extend<{ mockConsole: void }>({
  mockConsole: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const json =
          path === "/api/config"
            ? {
                region: "ap-southeast-1",
                flociPublicUrl: "http://localhost:4566",
                flociInternalUrl: "http://floci:4566",
              }
            : path === "/api/health"
              ? { status: "ok", endpoint: "http://floci:4566" }
              : path.includes("redis") && path.endsWith("/info")
                ? {
                    engine: "valkey",
                    version: "8.0",
                    memoryUsedBytes: 1024,
                    clients: 1,
                    keys: 1,
                    uptimeSeconds: 100,
                  }
                : path.includes("redis") && path.endsWith("/key")
                  ? {
                      name: resourceName,
                      type: "hash",
                      kind: "hash",
                      ttl: null,
                      length: 1,
                      cursor: null,
                      items: [{ field: resourceName, value: "Long value " + "token".repeat(30) }],
                    }
                  : path.includes("redis")
                    ? { keys: [{ name: resourceName, type: "hash", ttl: null }], cursor: null }
                    : path.endsWith("/queues")
                      ? [{ name: resourceName, type: "classic", durable: true, messages: 12 }]
                      : path.endsWith("/exchanges")
                        ? [{ name: "", type: "direct", durable: true }]
                        : {};
        await route.fulfill({ json });
      });
      await page.route("**/aws/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.replace(/^\/aws/, "");
        const target = request.headers()["x-amz-target"]?.split(".").at(-1);
        const action = new URLSearchParams(request.postData() ?? "").get("Action");
        const xml = async (body: string) => route.fulfill({ contentType: "application/xml", body });
        if (path.startsWith("/_floci"))
          return route.fulfill({
            json: { version: "2.4.0", edition: "community", services: { s3: "running" } },
          });
        if (target) {
          const payloads: Record<string, unknown> = {
            ListTables: { TableNames: [resourceName] },
            DescribeTable: { Table: table },
            Scan: {
              Items: [
                { pk: { S: "user-with-a-long-identifier-1234567890" }, status: { S: "READY" } },
              ],
              Count: 1,
            },
            DescribeTimeToLive: { TimeToLiveDescription: { TimeToLiveStatus: "DISABLED" } },
            DescribeContinuousBackups: {
              ContinuousBackupsDescription: { ContinuousBackupsStatus: "DISABLED" },
            },
            ListTagsOfResource: { Tags: [] },
            ListEventSourceMappings: { EventSourceMappings: [] },
            FilterLogEvents: {
              events: [
                {
                  eventId: "log-1",
                  timestamp: 1794787200000,
                  message: "Long log " + "unbroken-token".repeat(40),
                  logStreamName: "stream",
                },
              ],
            },
          };
          return route.fulfill({ json: payloads[target] ?? {} });
        }
        if (action?.startsWith("Describe")) {
          if (action === "DescribeCacheClusters")
            return xml(
              `<DescribeCacheClustersResponse><DescribeCacheClustersResult><CacheClusters><CacheCluster><CacheClusterId>${resourceName}</CacheClusterId><Engine>valkey</Engine><CacheClusterStatus>available</CacheClusterStatus><CacheNodes><CacheNode><CacheNodeId>0001</CacheNodeId><CacheNodeStatus>available</CacheNodeStatus><Endpoint><Address>localhost</Address><Port>6379</Port></Endpoint></CacheNode></CacheNodes></CacheCluster></CacheClusters></DescribeCacheClustersResult></DescribeCacheClustersResponse>`,
            );
          return xml(
            `<${action}Response><${action}Result><ReplicationGroups/></${action}Result></${action}Response>`,
          );
        }
        if (path.startsWith("/v1/brokers"))
          return route.fulfill({
            json: {
              brokerSummaries: [
                {
                  brokerId: "mobile-broker",
                  brokerName: resourceName,
                  brokerState: "RUNNING",
                  engineType: "RABBITMQ",
                  created: "2026-11-16T00:00:00Z",
                },
              ],
              brokerName: resourceName,
              brokerId: "mobile-broker",
              brokerState: "RUNNING",
              engineType: "RABBITMQ",
              brokerInstances: [],
            },
          });
        if (path.replace(/\/$/, "") === "/2015-03-31/functions")
          return route.fulfill({
            json: {
              Functions: [
                configuration,
                { ...configuration, FunctionName: "aaa-function", Runtime: "python3.12" },
              ],
            },
          });
        if (path.includes("/invocations"))
          return route.fulfill({
            status: 200,
            headers: {
              "x-amz-log-result": Buffer.from("LOG " + "token".repeat(200)).toString("base64"),
              "x-amzn-requestid": "mobile-request",
            },
            body: '{"ok":true}',
          });
        if (path.replace(/\/$/, "").endsWith("/event-source-mappings"))
          return route.fulfill({ json: { EventSourceMappings: [] } });
        if (path.includes("/functions/"))
          return route.fulfill({ json: { Configuration: configuration, Code: {} } });
        if (path === "/" || path === "")
          return xml(
            `<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Buckets><Bucket><Name>${resourceName}</Name><CreationDate>2026-11-16T00:00:00Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>`,
          );
        if (url.searchParams.has("list-type"))
          return xml(
            `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${resourceName}</Name><IsTruncated>false</IsTruncated><Contents><Key>${"very-long-file-name-".repeat(5)}.txt</Key><Size>2048</Size><LastModified>2026-11-16T00:00:00Z</LastModified></Contents></ListBucketResult>`,
          );
        if (url.searchParams.has("versioning"))
          return xml('<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>');
        if (url.searchParams.has("notification"))
          return xml(
            '<NotificationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>',
          );
        return route.fulfill({ json: {} });
      });
      await use();
      expect(errors, "no uncaught React errors").toEqual([]);
    },
    { auto: true },
  ],
});
