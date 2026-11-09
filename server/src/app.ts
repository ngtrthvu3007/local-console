import path from "node:path";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ElastiCacheClient } from "@aws-sdk/client-elasticache";
import type { Config } from "./config.ts";
import {
  AWS_TEST_CREDENTIALS,
  HTTP_NOT_FOUND,
  NOT_FOUND_ERROR_CODE,
  ROUTES,
  SPA_INDEX_FILE,
} from "./constants.ts";
import { errorHandler } from "./middleware/error.ts";
import { healthRouter } from "./routes/health.ts";
import { createRedisConnector } from "./routes/redis/client.ts";
import { redisRouter } from "./routes/redis/router.ts";

export function createApp(config: Config) {
  const app = express();

  app.use(healthRouter(config.AWS_ENDPOINT_URL));
  app.get(ROUTES.config, (_request, response) => {
    response.json({
      region: config.AWS_REGION,
      flociPublicUrl: config.FLOCI_PUBLIC_URL,
      flociInternalUrl: config.AWS_ENDPOINT_URL,
    });
  });

  // Phải đứng trước mọi body parser để body tới Floci nguyên vẹn
  app.use(
    ROUTES.awsProxy,
    createProxyMiddleware({ target: config.AWS_ENDPOINT_URL, changeOrigin: true }),
  );

  // Server chỉ dùng AWS API để tra endpoint của cluster Redis
  const elastiCache = new ElastiCacheClient({
    region: config.AWS_REGION,
    endpoint: config.AWS_ENDPOINT_URL,
    credentials: AWS_TEST_CREDENTIALS,
  });
  const withRedis = createRedisConnector(elastiCache, config.AWS_ENDPOINT_URL);
  app.use(ROUTES.redis, redisRouter(withRedis));

  app.use(ROUTES.apiPrefix, (_request, response) => {
    response
      .status(HTTP_NOT_FOUND)
      .json({ code: NOT_FOUND_ERROR_CODE, message: "Unknown API route" });
  });
  app.use(errorHandler);

  if (config.STATIC_DIR) {
    const directory = path.resolve(config.STATIC_DIR);
    const indexFile = path.join(directory, SPA_INDEX_FILE);
    app.use(express.static(directory));
    app.get(ROUTES.spaFallback, (_request, response) => response.sendFile(indexFile));
  }

  return app;
}
