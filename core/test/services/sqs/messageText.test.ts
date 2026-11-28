import { describe, expect, it } from "vitest";
import {
  bodyPreview,
  bodyText,
  messageIdPreview,
  systemAttributeText,
} from "#services/sqs/messageText.ts";
import { formatDate } from "#shared/utils/format.ts";

describe("messageText", () => {
  it("shortens ID and body for the table, keeps JSON readable in the panel", () => {
    const message = { MessageId: "0c19aabf-1111-2222", Body: '{"a":\n  1}' };
    expect(messageIdPreview(message)).toBe("0c19aabf…");
    expect(bodyPreview(message)).toBe('{"a": 1}');
    expect(bodyText(message)).toBe('{\n  "a": 1\n}');
  });

  it("formats timestamp attributes and leaves the rest as SQS sent them", () => {
    expect(systemAttributeText("SentTimestamp", "1794787200000")).toBe(formatDate(1794787200000));
    expect(systemAttributeText("ApproximateReceiveCount", "3")).toBe("3");
  });
});
