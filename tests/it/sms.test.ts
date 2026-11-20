import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { beforeAll, describe, expect, it } from "vitest";
import { AWS_PROXY_URL, consoleConfig, uniqueName, viaConsole } from "./helpers.ts";

// Hộp thư SMS của Floci (GET /_aws/sns). Floci không xóa được từng tin (DELETE xóa tin của MỌI region,
// bỏ qua ?id=), nên test này không dọn tin của mình và không test việc xóa: chạy nó không được làm mất
// SMS của người khác. Số giả có tiền tố +8490000 để tìm lại đúng tin của test.
const phone = `+8490000${Math.floor(Math.random() * 10_000)
  .toString()
  .padStart(4, "0")}`;

interface Sms {
  Id: string;
  Region: string;
  PhoneNumber: string;
  Message: string;
  Subject: string | null;
}

let region: string;
let sns: SNSClient;

const mine = async (): Promise<Sms[]> =>
  (await (await fetch(`${AWS_PROXY_URL}/_aws/sns?${new URLSearchParams({ phone })}`)).json())
    .messages;

const publish = (message: string) =>
  sns.send(
    new PublishCommand({
      PhoneNumber: phone,
      Message: message,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
      },
    }),
  );

beforeAll(async () => {
  region = (await consoleConfig()).region;
  sns = new SNSClient(viaConsole(region));
});

describe("SNS text messages through /aws", () => {
  it("keeps a message published to a phone number in the inbox of its region", async () => {
    const text = uniqueName("sms");
    const { MessageId } = await publish(text);

    const sms = (await mine()).find((item) => item.Message === text);
    expect(MessageId).toBeTruthy();
    expect(sms).toMatchObject({ Region: region, PhoneNumber: phone, Message: text });
  });

  it("keeps several messages to the same number, each with its own id", async () => {
    await publish(uniqueName("first"));
    await publish(uniqueName("second"));

    const ids = (await mine()).map((item) => item.Id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
