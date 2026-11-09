import express, { Router, type Request } from "express";
import { z } from "zod";
import { HTTP_CREATED, HTTP_UNAUTHORIZED } from "../../constants.ts";
import { HttpError } from "../../middleware/error.ts";
import {
  createQueue,
  deleteQueue,
  listExchanges,
  listQueues,
  peek,
  publish,
  purgeQueue,
  type CallRabbit,
  type Rabbit,
} from "./client.ts";
import {
  RABBIT_ERROR_CODES,
  type CreateQueueInput,
  type PeekInput,
  type PublishInput,
} from "./contract.ts";

// Payload thử tới 1 MB; JSON escape có thể làm body lớn hơn
const BODY_LIMIT = "4mb";
const PEEK_MAX_COUNT = 50;
const BASIC_AUTH_PREFIX = "Basic ";

const brokerParams = z.object({ broker: z.string().min(1) });
const nameParams = brokerParams.extend({ name: z.string().min(1) });
const createQueueSchema = z.object({ durable: z.boolean() }) satisfies z.ZodType<CreateQueueInput>;
const publishSchema = z.object({
  routingKey: z.string(),
  payload: z.string(),
}) satisfies z.ZodType<PublishInput>;
const peekSchema = z.object({
  count: z.number().int().min(1).max(PEEK_MAX_COUNT),
}) satisfies z.ZodType<PeekInput>;

// Cầu nối tới API quản lý của RabbitMQ: trình duyệt bị chặn CORS và cần đăng nhập
export function rabbitRouter(callRabbit: CallRabbit): Router {
  const router = Router();
  router.use(express.json({ limit: BODY_LIMIT }));

  // Broker của request + user/pass trình duyệt gửi kèm (header Authorization: Basic …)
  function rabbitFor(request: Request): Rabbit {
    const { broker } = brokerParams.parse(request.params);
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith(BASIC_AUTH_PREFIX)) {
      throw new HttpError(
        HTTP_UNAUTHORIZED,
        RABBIT_ERROR_CODES.unauthorized,
        "Sign in to the broker first",
      );
    }
    return (path, init) => callRabbit(broker, authorization, path, init);
  }

  router.get("/:broker/queues", async (request, response) => {
    response.json(await listQueues(rabbitFor(request)));
  });

  router.get("/:broker/exchanges", async (request, response) => {
    response.json(await listExchanges(rabbitFor(request)));
  });

  router.put("/:broker/queues/:name", async (request, response) => {
    const { name } = nameParams.parse(request.params);
    await createQueue(rabbitFor(request), name, createQueueSchema.parse(request.body));
    response.status(HTTP_CREATED).json({ name });
  });

  router.delete("/:broker/queues/:name", async (request, response) => {
    const { name } = nameParams.parse(request.params);
    await deleteQueue(rabbitFor(request), name);
    response.json({ name });
  });

  router.post("/:broker/exchanges/:name/publish", async (request, response) => {
    const { name } = nameParams.parse(request.params);
    response.json(await publish(rabbitFor(request), name, publishSchema.parse(request.body)));
  });

  router.post("/:broker/queues/:name/peek", async (request, response) => {
    const { name } = nameParams.parse(request.params);
    const { count } = peekSchema.parse(request.body);
    response.json(await peek(rabbitFor(request), name, count));
  });

  router.delete("/:broker/queues/:name/messages", async (request, response) => {
    const { name } = nameParams.parse(request.params);
    await purgeQueue(rabbitFor(request), name);
    response.json({ name });
  });

  return router;
}
