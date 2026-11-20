import { CreateEmailIdentityCommand, CreateEmailTemplateCommand, DeleteEmailIdentityCommand, DeleteEmailTemplateCommand, GetEmailTemplateCommand, ListEmailTemplatesCommand, SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AWS_PROXY_URL, consoleConfig, uniqueName, viaConsole } from "./helpers.ts";

interface Mail {
  Id: string;
  Source: string;
  Region: string;
  Subject?: string;
  Destination?: unknown;
  Headers?: unknown;
}

const sender = `${uniqueName("sender")}@example.com`;
const template = uniqueName("template");
let region: string;
let ses: SESv2Client;

const mailbox = async (): Promise<Mail[]> =>
  (await (await fetch(`${AWS_PROXY_URL}/_aws/ses`)).json()).messages;

const send = (subject: string) =>
  ses.send(
    new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: ["to@example.com"], CcAddresses: ["cc@example.com"], BccAddresses: ["bcc@example.com"] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Text: { Data: "hello" } },
          Headers: [{ Name: "X-Lc-Test", Value: "1" }],
        },
      },
    }),
  );

beforeAll(async () => {
  region = (await consoleConfig()).region;
  ses = new SESv2Client(viaConsole(region));
});

afterAll(async () => {
  // Chỉ xóa theo id, và chỉ mail của test này
  for (const mail of (await mailbox()).filter((item) => item.Source === sender && item.Id)) {
    await fetch(`${AWS_PROXY_URL}/_aws/ses?id=${encodeURIComponent(mail.Id)}`, { method: "DELETE" });
  }
  await ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: sender })).catch(() => undefined);
  await ses.send(new DeleteEmailTemplateCommand({ TemplateName: template })).catch(() => undefined);
});

describe("SES through /aws", () => {
  it("rejects mail from an address that is not verified", async () => {
    await expect(send("rejected")).rejects.toMatchObject({ name: "MessageRejected" });
  });

  it("keeps a sent mail in the mailbox of its region", async () => {
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: sender }));
    const subject = uniqueName("mail");
    await send(subject);
    const mail = (await mailbox()).find((item) => item.Source === sender && item.Subject === subject);
    expect(mail).toMatchObject({
      Region: region,
      Subject: subject,
      Destination: { ToAddresses: ["to@example.com"], CcAddresses: ["cc@example.com"], BccAddresses: ["bcc@example.com"] },
      Headers: [{ Name: "X-Lc-Test", Value: "1" }],
    });
  });

  it("deletes only the mail with the given id", async () => {
    await send("first");
    await send("second");
    const mails = (await mailbox()).filter((item) => item.Source === sender);
    const first = mails.find((item) => item.Subject === "first");
    const second = mails.find((item) => item.Subject === "second");
    expect(first && second).toBeTruthy();
    await fetch(`${AWS_PROXY_URL}/_aws/ses?id=${first?.Id}`, { method: "DELETE" });
    const left = (await mailbox()).map((item) => item.Id);
    expect(left).not.toContain(first?.Id);
    expect(left).toContain(second?.Id);
  });

  it("lists, reads and deletes a template", async () => {
    await ses.send(new CreateEmailTemplateCommand({ TemplateName: template, TemplateContent: { Subject: "Hi", Text: "t" } }));
    const names = async () => ((await ses.send(new ListEmailTemplatesCommand({}))).TemplatesMetadata ?? []).map((item) => item.TemplateName);
    expect(await names()).toContain(template);
    const got = await ses.send(new GetEmailTemplateCommand({ TemplateName: template }));
    expect(got.TemplateContent?.Subject).toBe("Hi");
    await ses.send(new DeleteEmailTemplateCommand({ TemplateName: template }));
    expect(await names()).not.toContain(template);
  });
});
