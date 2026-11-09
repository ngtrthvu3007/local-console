import path from "node:path";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Config } from "./config.ts";
import { HTTP_NOT_FOUND, NOT_FOUND_ERROR_CODE, ROUTES, SPA_INDEX_FILE } from "./constants.ts";
import { healthRouter } from "./routes/health.ts";

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

  app.use(ROUTES.apiPrefix, (_request, response) => {
    response
      .status(HTTP_NOT_FOUND)
      .json({ code: NOT_FOUND_ERROR_CODE, message: "Unknown API route" });
  });

  if (config.STATIC_DIR) {
    const directory = path.resolve(config.STATIC_DIR);
    const indexFile = path.join(directory, SPA_INDEX_FILE);
    app.use(express.static(directory));
    app.get(ROUTES.spaFallback, (_request, response) => response.sendFile(indexFile));
  }

  return app;
}
