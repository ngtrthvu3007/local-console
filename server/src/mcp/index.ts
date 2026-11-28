import express, { Router, type Request } from "express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  INVALID_PARAMS,
  JSONRPC_VERSION,
  McpServer,
} from "@modelcontextprotocol/server";
import { HTTP_BAD_REQUEST, ROUTES } from "../constants.ts";
import {
  GROUP_SEPARATOR,
  MCP_QUERY,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  QUERY_TRUE,
} from "./constants.ts";
import { McpQueryError, selectTools, TOOL_GROUPS, type ToolFilter } from "./registry.ts";
import type { Services } from "./services.ts";

export function parseMcpQuery(query: Request["query"]): ToolFilter {
  const services = query[MCP_QUERY.services];

  return {
    services:
      typeof services === "string"
        ? services
            .split(GROUP_SEPARATOR)
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined,
    readOnly: query[MCP_QUERY.readOnly] === QUERY_TRUE,
  };
}

// Stateless: mỗi request dựng McpServer mới với đúng các tool đã lọc theo URL. createMcpHandler phục vụ
// cả client theo spec 2026-07-28 lẫn client 2025 (GET / DELETE của session cũ trả 405)
export function mcpRouter(services: Services): Router {
  const router = Router();

  router.all(
    ROUTES.mcp,
    express.json({ limit: DEFAULT_MAX_REQUEST_BODY_SIZE }),
    async (request, response) => {
      let tools;
      try {
        tools = selectTools(TOOL_GROUPS, parseMcpQuery(request.query));
      } catch (error) {
        if (!(error instanceof McpQueryError)) throw error;
        // Factory của SDK ném lỗi thì client chỉ nhận "Internal server error": kiểm trước để giữ câu báo
        response.status(HTTP_BAD_REQUEST).json({
          jsonrpc: JSONRPC_VERSION,
          id: request.body?.id ?? null,
          error: { code: INVALID_PARAMS, message: error.message },
        });
        return;
      }

      const origin = `${request.protocol}://${request.get("host")}`;
      const context = { services, consoleUrl: (path: string) => `${origin}${path}` };
      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
        for (const tool of tools) tool.register(server, context);
        return server;
      });

      await toNodeHandler(handler)(request, response, request.body);
    },
  );

  return router;
}
