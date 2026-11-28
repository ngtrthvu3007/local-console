import { RESET_GROUP } from "./constants.ts";
import type { McpTool, ToolGroup } from "./tool.ts";
import { FLOCI_TOOLS, RESET_TOOLS } from "./tools/floci.ts";
import { SES_TOOLS } from "./tools/ses.ts";
import { SQS_TOOLS } from "./tools/sqs.ts";

// Thêm service = một file trong tools/ + một dòng ở đây
export const TOOL_GROUPS: ToolGroup[] = [FLOCI_TOOLS, RESET_TOOLS, SQS_TOOLS, SES_TOOLS];

export class McpQueryError extends Error {}

export interface ToolFilter {
  services?: string[]; // không có = mọi nhóm trừ reset
  readOnly: boolean;
}

export function selectTools(groups: readonly ToolGroup[], { services, readOnly }: ToolFilter) {
  const ids = groups.map((group) => group.id);
  // Báo lỗi thay vì lặng lẽ bỏ qua: gõ nhầm "sqs,sse" thì agent không thấy tool SES mà không biết vì sao
  const unknown = (services ?? []).filter((id) => !ids.includes(id));
  if (unknown.length)
    throw new McpQueryError(
      `Unknown service group: ${unknown.join(", ")}. Valid groups: ${ids.join(", ")}.`,
    );

  return groups
    .filter((group) => (services ? services.includes(group.id) : group.id !== RESET_GROUP))
    .flatMap((group) => group.tools)
    .filter((tool: McpTool) => !readOnly || tool.annotations.readOnlyHint);
}
