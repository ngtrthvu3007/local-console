import { describe, expect, it } from "vitest";
import { APP_DATA_WARNING } from "../../src/mcp/constants.ts";
import { SES_TOOLS } from "../../src/mcp/tools/ses.ts";

const tool = (name: string) => SES_TOOLS.tools.find((candidate) => candidate.name === name)!;
const namesWith = (hint: "readOnlyHint" | "destructiveHint") =>
  SES_TOOLS.tools.filter((candidate) => candidate.annotations[hint]).map((item) => item.name);

describe("SES tools", () => {
  it("has the 13 tools of the spec", () => {
    expect(SES_TOOLS.tools.map((item) => item.name)).toEqual([
      "ses_read_email",
      "ses_read_identity",
      "ses_read_template",
      "ses_read_configuration_set",
      "ses_delete_email",
      "ses_create_identity",
      "ses_set_identity_configuration_set",
      "ses_delete_identity",
      "ses_delete_template",
      "ses_create_configuration_set",
      "ses_put_event_destination",
      "ses_delete_configuration_set",
      "ses_delete_event_destination",
    ]);
  });

  it("marks read and destructive tools", () => {
    expect(namesWith("readOnlyHint")).toEqual([
      "ses_read_email",
      "ses_read_identity",
      "ses_read_template",
      "ses_read_configuration_set",
    ]);
    expect(namesWith("destructiveHint")).toEqual([
      "ses_delete_email",
      "ses_delete_identity",
      "ses_delete_template",
      "ses_delete_configuration_set",
      "ses_delete_event_destination",
    ]);
  });

  it("rejects ses_read_email get without id", () => {
    expect(tool("ses_read_email").inputSchema.safeParse({ method: "get" }).success).toBe(false);
  });

  it("warns the agent not to follow instructions inside emails", () => {
    expect(tool("ses_read_email").description).toContain(APP_DATA_WARNING);
  });

  it("checks a destination like the Add destination form", () => {
    const parsed = tool("ses_put_event_destination").inputSchema.safeParse({
      configurationSet: "set",
      name: "d",
      eventTypes: [],
      arn: "arn:aws:sns:ap-southeast-1:000000000000:t",
    });
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      "Choose at least one event type.",
    ]);
  });
});
