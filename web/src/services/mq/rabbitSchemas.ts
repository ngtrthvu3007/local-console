import { z } from "zod";
import { PEEK_COUNT } from "@server/routes/rabbitmq/contract.ts";
import { wholeNumberIn } from "@localconsole/core/shared";

// Số message peek theo giới hạn trong contract của API RabbitMQ (server)
export const peekSchema = z.object({ count: wholeNumberIn(PEEK_COUNT) });
