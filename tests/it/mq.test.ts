import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amazonMq, consoleApi, consoleConfig, uniqueName, waitFor } from "./helpers.ts";

// Broker RabbitMQ thật do Floci bật; console gọi API quản lý của nó qua /api/mq
const USERNAME = "lcit";
const PASSWORD = "lc-it-password-1"; // MQ đòi mật khẩu từ 12 ký tự
const auth = { authorization: `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}` };
const queue = uniqueName("queue");
let region: string;
let brokerId: string;

beforeAll(async () => {
  region = (await consoleConfig()).region;
  const created = await amazonMq(region, "POST", "/v1/brokers", {
    brokerName: uniqueName("broker"),
    engineType: "RABBITMQ",
    engineVersion: "3.13",
    hostInstanceType: "mq.t3.micro",
    deploymentMode: "SINGLE_INSTANCE",
    publiclyAccessible: false,
    autoMinorVersionUpgrade: true,
    users: [{ username: USERNAME, password: PASSWORD }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  brokerId = created.body.brokerId;
  // Console trả 409 BrokerNotReady cho tới khi broker RUNNING và API quản lý trả lời
  await waitFor("RabbitMQ broker to answer through the console", async () => {
    const queues = await consoleApi("GET", `/api/mq/${brokerId}/queues`, { headers: auth });
    return queues.status === 200 ? queues.body : undefined;
  });
});

afterAll(async () => {
  if (brokerId) await amazonMq(region, "DELETE", `/v1/brokers/${brokerId}`);
});

describe("RabbitMQ through /api/mq", () => {
  it("asks for credentials before calling the broker", async () => {
    const { status, body } = await consoleApi("GET", `/api/mq/${brokerId}/queues`);
    expect(status).toBe(401);
    expect(body.message).toBe("Sign in to the broker first");
  });

  it("reports a wrong password as 401, not as a broker error", async () => {
    const wrong = { authorization: `Basic ${Buffer.from(`${USERNAME}:nope`).toString("base64")}` };
    const { status, body } = await consoleApi("GET", `/api/mq/${brokerId}/queues`, { headers: wrong });
    expect(status).toBe(401);
    expect(body.message).toBe("Wrong username or password");
  });

  it("creates a queue, publishes to it, peeks and purges", async () => {
    const created = await consoleApi("PUT", `/api/mq/${brokerId}/queues/${queue}`, {
      headers: auth,
      body: { durable: true },
    });
    expect(created).toEqual({ status: 201, body: { name: queue } });

    // Exchange mặc định định tuyến theo tên queue
    const published = await consoleApi("POST", `/api/mq/${brokerId}/exchanges/amq.default/publish`, {
      headers: auth,
      body: { routingKey: queue, payload: '{"orderId":1}' },
    });
    expect(published.status).toBe(200);

    const peeked = await consoleApi("POST", `/api/mq/${brokerId}/queues/${queue}/peek`, {
      headers: auth,
      body: { count: 5 },
    });
    expect(peeked.body).toEqual([
      expect.objectContaining({ payload: '{"orderId":1}', routingKey: queue }),
    ]);

    // Peek không lấy mất message: purge vẫn còn message để xoá, sau đó peek ra rỗng
    await consoleApi("DELETE", `/api/mq/${brokerId}/queues/${queue}/messages`, { headers: auth });
    const empty = await consoleApi("POST", `/api/mq/${brokerId}/queues/${queue}/peek`, {
      headers: auth,
      body: { count: 5 },
    });
    expect(empty.body).toEqual([]);
  });

  it("lists publishable exchanges, the default one under an empty name", async () => {
    const { body } = await consoleApi("GET", `/api/mq/${brokerId}/exchanges`, { headers: auth });
    const names = body.map((exchange: { name: string }) => exchange.name);
    // RabbitMQ đặt tên rỗng cho exchange mặc định; web hiện thành "(AMQP default)"
    expect(names).toEqual(expect.arrayContaining(["", "amq.direct", "amq.topic"]));
    // Exchange nội bộ không publish được nên bị lọc
    expect(names).not.toContain("amq.rabbitmq.trace");
  });

  it("deletes the queue", async () => {
    const deleted = await consoleApi("DELETE", `/api/mq/${brokerId}/queues/${queue}`, { headers: auth });
    expect(deleted.status).toBe(200);
    const { body } = await consoleApi("GET", `/api/mq/${brokerId}/queues`, { headers: auth });
    expect(body.map((item: { name: string }) => item.name)).not.toContain(queue);
  });

  it("answers 404 for an unknown broker", async () => {
    const { status, body } = await consoleApi("GET", `/api/mq/${uniqueName("missing")}/queues`, {
      headers: auth,
    });
    expect(status).toBe(404);
    expect(body.code).toBe("BrokerNotFound");
  });
});
