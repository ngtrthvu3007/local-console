import type { CallToolResult, McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { fail } from "./result.ts";
import type { Services } from "./services.ts";

export interface ToolContext {
  services: Services;
  consoleUrl: (path: string) => string; // origin theo Host của request: user đổi cổng vẫn đúng
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  annotations: ToolAnnotations;
  register: (server: McpServer, context: ToolContext) => void;
}

export interface ToolGroup {
  id: string;
  tools: McpTool[];
}

interface ToolDefinition<S extends z.ZodType> extends Omit<McpTool, "inputSchema" | "register"> {
  inputSchema: S;
  handler: (input: z.output<S>, context: ToolContext) => Promise<CallToolResult>;
}

// SDK kiểm input bằng inputSchema trước khi gọi handler; lỗi trong handler thành isError, không 500
export function defineTool<S extends z.ZodType>({ handler, ...tool }: ToolDefinition<S>): McpTool {
  const inputSchema: z.ZodType = tool.inputSchema;

  return {
    ...tool,
    register: (server, context) =>
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema, annotations: tool.annotations },
        async (input) => {
          try {
            // SDK đã parse input bằng chính inputSchema nên input đúng là output của S
            return await handler(input as z.output<S>, context);
          } catch (error) {
            return fail(error);
          }
        },
      ),
  };
}

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
export const CREATES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false };
// Gửi lại cùng input cho cùng kết quả: client có thể tự chạy lại
export const UPDATES: ToolAnnotations = { ...CREATES, idempotentHint: true };
export const DESTROYS: ToolAnnotations = { readOnlyHint: false, destructiveHint: true };
