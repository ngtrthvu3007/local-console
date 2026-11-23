import { describe, expect, it } from "vitest";
import {
  headersFromFields,
  mailboxForRegion,
  mailboxSchema,
  matchesSearch,
  needsMimeFields,
  rawText,
  readEmail,
  recipientsOf,
  withMimeFields,
} from "../../../src/services/ses/mailbox.ts";

const REGION = "ap-southeast-1";

const base = {
  Id: "a",
  Region: REGION,
  Source: "noreply@app.local",
  Timestamp: "2026-11-17T17:16:45.705209341Z",
};

const RAW_MIME = [
  "From: noreply@app.local",
  "To: user@example.com",
  "Subject: Confirm your account",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<a href="http://localhost:3000/confirm">Confirm</a>',
  "--b1",
  'Content-Type: text/plain; name="a.txt"',
  'Content-Disposition: attachment; filename="a.txt"',
  "Content-Transfer-Encoding: base64",
  "",
  "aGk=",
  "--b1",
  "Content-Type: text/calendar; method=REQUEST",
  'Content-Disposition: attachment; filename="invite.ics"',
  "",
  "BEGIN:VCALENDAR",
  "--b1--",
].join("\r\n");

describe("mailboxForRegion", () => {
  it("keeps this region only, newest first", () => {
    const messages = [
      base,
      { ...base, Id: "b", Timestamp: "2026-11-17T17:16:45.706209Z" },
      { ...base, Id: "c", Region: "us-east-1", Timestamp: "2026-11-17T18:00:00.000000Z" },
    ];

    expect(mailboxForRegion(messages, REGION).map((email) => email.Id)).toEqual(["b", "a"]);
  });
});

describe("recipientsOf", () => {
  it("lists To, then Cc, then Bcc", () => {
    const email = {
      ...base,
      Destination: {
        ToAddresses: ["to@example.com"],
        CcAddresses: ["cc@example.com"],
        BccAddresses: ["bcc@example.com"],
      },
    };

    expect(recipientsOf(email)).toEqual(["to@example.com", "cc@example.com", "bcc@example.com"]);
  });
});

describe("matchesSearch", () => {
  const email = {
    ...base,
    Subject: "Confirm your account",
    Destination: { ToAddresses: ["user@example.com"] },
  };

  it("matches recipients, Source and Subject without case", () => {
    expect(matchesSearch(email, "USER@")).toBe(true);
    expect(matchesSearch(email, "confirm")).toBe(true);
    expect(matchesSearch(email, "noreply")).toBe(true);
  });

  it("does not match other text", () => {
    expect(matchesSearch(email, "zzz")).toBe(false);
  });

  it("keeps a rejected mail with no searchable field when search is empty", () => {
    const rejectedMail = {
      Id: "r",
      Region: REGION,
      Timestamp: base.Timestamp,
      RejectReason: "Message rejected",
    };

    expect(matchesSearch(rejectedMail, "")).toBe(true);
  });
});

describe("headersFromFields", () => {
  it("builds headers from Floci fields", () => {
    const email = {
      ...base,
      ReturnPath: "bounce@app.local",
      Destination: {
        ToAddresses: ["user@example.com", "other@example.com"],
        CcAddresses: ["cc@example.com"],
      },
      ReplyToAddresses: ["support@app.local"],
      Subject: "Plain one",
      Headers: [{ Name: "X-Lc-Probe", Value: "1" }],
    };

    expect(headersFromFields(email)).toEqual([
      { name: "From", value: "noreply@app.local" },
      { name: "Return-Path", value: "bounce@app.local" },
      { name: "To", value: "user@example.com, other@example.com" },
      { name: "Cc", value: "cc@example.com" },
      { name: "Reply-To", value: "support@app.local" },
      { name: "Subject", value: "Plain one" },
      { name: "Date", value: "Tue, 17 Nov 2026 17:16:45 GMT" },
      { name: "X-Lc-Probe", value: "1" },
    ]);
  });
});

describe("readEmail", () => {
  it("reads a SendRawEmail mail from MIME", async () => {
    const content = await readEmail({ ...base, RawData: btoa(RAW_MIME) });

    expect(content.subject).toBe("Confirm your account");
    expect(content.to).toEqual(["user@example.com"]);
    expect(content.html).toContain('href="http://localhost:3000/confirm"');
    expect(content.attachments[0]).toMatchObject({ fileName: "a.txt", mimeType: "text/plain" });
    expect(content.attachments[0]?.content.byteLength).toBe(2);

    expect(content.attachments[1]).toMatchObject({
      fileName: "invite.ics",
      mimeType: "text/calendar",
    });

    expect(content.attachments[1]?.content.byteLength).toBe("BEGIN:VCALENDAR\n".length);
    expect(content.headers).toContainEqual({ name: "subject", value: "Confirm your account" });
  });

  it("uses Floci fields when there is no RawData", async () => {
    const email = {
      ...base,
      Subject: "Plain one",
      Body: { text_part: "hello text", html_part: null },
    };

    const content = await readEmail(email);

    expect(content.text).toBe("hello text");
    expect(content.html).toBeUndefined();
    expect(content.headers).toEqual(headersFromFields(email));
    expect(content.attachments).toEqual([]);
  });

  it("falls back to fields when RawData is broken", async () => {
    const content = await readEmail({ ...base, RawData: "%%%", Body: { text_part: "hello text" } });

    expect(content.text).toBe("hello text");
  });
});

describe("rawText", () => {
  it("decodes RawData to MIME text", () => {
    expect(rawText(btoa(RAW_MIME))).toContain("Subject: Confirm your account");
  });

  it("returns broken RawData as it is", () => {
    expect(rawText("%%%")).toBe("%%%");
  });
});

describe("mailboxSchema", () => {
  it("rejects a response without messages", () => {
    expect(mailboxSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a rejected mail with no content", () => {
    const result = mailboxSchema.safeParse({
      messages: [
        { Id: "r", Region: REGION, Timestamp: base.Timestamp, RejectReason: "Message rejected" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data && recipientsOf(result.data.messages[0])).toEqual([]);
  });
});

describe("needsMimeFields / withMimeFields", () => {
  const raw = { ...base, RawData: "e30=" };
  const fields = { subject: "Hi", to: ["a@x.com"] };

  it("fills a raw mail with no Subject and no Destination", () => {
    expect(needsMimeFields(raw)).toBe(true);
    const filled = withMimeFields(raw, fields);
    expect(filled.Subject).toBe("Hi");
    expect(filled.Destination?.ToAddresses).toEqual(["a@x.com"]);
  });

  it("skips a mail that already has Subject and Destination", () => {
    expect(
      needsMimeFields({ ...raw, Subject: "S", Destination: { ToAddresses: ["b@x.com"] } }),
    ).toBe(false);
  });

  it("skips rejected mail and mail without RawData", () => {
    expect(needsMimeFields({ ...raw, RejectReason: "no" })).toBe(false);
    expect(needsMimeFields(base)).toBe(false);
  });

  it("treats an empty Subject as missing", () => {
    const email = { ...raw, Subject: "", Destination: { ToAddresses: ["b@x.com"] } };
    expect(needsMimeFields(email)).toBe(true);
    expect(withMimeFields(email, fields).Subject).toBe("Hi");
  });

  it("keeps existing Subject and Destination", () => {
    const email = { ...raw, Subject: "S", Destination: { ToAddresses: ["b@x.com"] } };
    const filled = withMimeFields(email, fields);
    expect(filled.Subject).toBe("S");
    expect(filled.Destination?.ToAddresses).toEqual(["b@x.com"]);
  });

  it("leaves Destination missing when to is empty", () => {
    expect(withMimeFields(raw, { subject: "Hi", to: [] }).Destination).toBeUndefined();
  });
});
