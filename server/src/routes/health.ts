import { Router } from "express";
import { FLOCI_HEALTH_PATH, HEALTH_TIMEOUT_MS, ROUTES } from "../constants.ts";

const NO_RESPONSE = "No response";

type NetworkError = Error & { cause?: Error & { code?: string } };

// localhost (IPv4 + IPv6) cho AggregateError có message rỗng, chỉ có code
const reasonOf = (error: NetworkError) =>
  error.cause?.message || error.cause?.code || error.message || NO_RESPONSE;

export function healthRouter(endpoint: string): Router {
  const router = Router();
  router.get(ROUTES.health, async (_request, response) => {
    try {
      const flociResponse = await fetch(new URL(FLOCI_HEALTH_PATH, endpoint), {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!flociResponse.ok) throw new Error(`Floci responded with HTTP ${flociResponse.status}`);
      response.json({ status: "ok", endpoint });
    } catch (error) {
      response.json({ status: "unavailable", endpoint, error: reasonOf(error as NetworkError) });
    }
  });
  return router;
}
