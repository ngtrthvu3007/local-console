import { z } from "zod";
import { CONSOLE_HOME_PATH, FLOCI_GROUP, RESET_GROUP } from "../constants.ts";
import { ok } from "../result.ts";
import { defineTool, DESTROYS, READ_ONLY, type ToolGroup } from "../tool.ts";

export const FLOCI_TOOLS: ToolGroup = {
  id: FLOCI_GROUP,
  tools: [
    defineTool({
      name: "floci_read_status",
      description:
        "Shows whether Floci (the local AWS emulator) is running, its version and the state of each service. Use it first when other tools fail or to see which services are available.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      handler: async (_input, { services, consoleUrl }) =>
        ok(await services.floci.getInfo(), consoleUrl(CONSOLE_HOME_PATH)),
    }),
  ],
};

export const RESET_TOOLS: ToolGroup = {
  id: RESET_GROUP,
  tools: [
    defineTool({
      name: "floci_reset_data",
      description:
        "Deletes all data of every service in Floci (queues, buckets, tables, functions…), like Reset data on the console home page. Use it only when the user asks to start from a clean state.",
      inputSchema: z.object({}),
      annotations: DESTROYS,
      handler: async (_input, { services, consoleUrl }) => {
        await services.floci.resetData();
        return ok({ reset: true }, consoleUrl(CONSOLE_HOME_PATH));
      },
    }),
  ],
};
