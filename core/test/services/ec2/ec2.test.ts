import { describe, expect, it } from "vitest";
import { NAME_MAX_LENGTH, USER_DATA_MAX_BYTES } from "#services/ec2/constants.ts";
import { amiWarning } from "#services/ec2/images.ts";
import { ACTION_ALLOWED, instanceName } from "#services/ec2/instances.ts";
import { launchInstanceSchema } from "#services/ec2/schemas.ts";
import { decodeUserData, encodeUserData } from "#services/ec2/userData.ts";
import { ec2Routes } from "#services/ec2/paths.ts";

describe("userData", () => {
  it("encodes UTF-8 as base64 that AWS decodes", () => {
    expect(encodeUserData("#!/bin/bash\necho hi")).toBe(
      Buffer.from("#!/bin/bash\necho hi").toString("base64"),
    );
  });

  it("round-trips Vietnamese text and emoji", () => {
    const script = "#!/bin/bash\necho 'xin chào, Việt Nam 🚀' > /tmp/hello";
    expect(decodeUserData(encodeUserData(script))).toBe(script);
  });

  it("decodes what Floci returns", () => {
    expect(decodeUserData(Buffer.from("xin chào").toString("base64"))).toBe("xin chào");
  });
});

describe("instanceName", () => {
  it("reads the Name tag, shows a dash without one", () => {
    expect(instanceName({ Tags: [{ Key: "Name", Value: "web-1" }] })).toBe("web-1");
    expect(instanceName({ Tags: [{ Key: "Env", Value: "dev" }] })).toBe("—");
    expect(instanceName({})).toBe("—");
  });
});

describe("launchInstanceSchema", () => {
  const VALID = { name: "web-1", imageId: "ami-1", instanceType: "t3.micro", userData: "" };
  const messages = (form: Partial<typeof VALID>) =>
    launchInstanceSchema.safeParse({ ...VALID, ...form }).error?.issues.map((i) => i.message) ?? [];

  it("accepts a minimal form", () => {
    expect(messages({})).toEqual([]);
    expect(messages({ name: "" })).toEqual([]);
  });

  it("requires an AMI", () => {
    expect(messages({ imageId: "" })).toEqual(["Choose an AMI."]);
  });

  it("limits the name to 256 characters", () => {
    expect(messages({ name: "a".repeat(NAME_MAX_LENGTH) })).toEqual([]);
    expect(messages({ name: "a".repeat(NAME_MAX_LENGTH + 1) })).toHaveLength(1);
  });

  it("limits user data to 16 KB counted in bytes, not characters", () => {
    expect(messages({ userData: "a".repeat(USER_DATA_MAX_BYTES) })).toEqual([]);
    expect(messages({ userData: "a".repeat(USER_DATA_MAX_BYTES + 1) })).toHaveLength(1);
    // "à" là 2 byte: đủ ký tự nhưng vượt giới hạn byte
    expect(messages({ userData: "à".repeat(USER_DATA_MAX_BYTES / 2 + 1) })).toHaveLength(1);
  });
});

describe("amiWarning", () => {
  it("warns about images Floci can't run as named", () => {
    expect(amiWarning({ Architecture: "arm64", Name: "al2023" })).toMatch(/arm64/);
    expect(amiWarning({ Architecture: "x86_64", Name: "Windows_Server-2022" })).toMatch(/Windows/);
    expect(amiWarning({ Architecture: "x86_64", Name: "alpine-linux-latest" })).toMatch(/Alpine/);
  });

  it("stays quiet for images that work", () => {
    expect(amiWarning({ Architecture: "x86_64", Name: "al2023-ami" })).toBeUndefined();
    expect(amiWarning({ Architecture: "x86_64", Name: "ubuntu-jammy-22.04" })).toBeUndefined();
    expect(amiWarning(undefined)).toBeUndefined();
  });
});

describe("ACTION_ALLOWED", () => {
  it("matches the states AWS allows", () => {
    expect(ACTION_ALLOWED.stop("running")).toBe(true);
    expect(ACTION_ALLOWED.stop("stopped")).toBe(false);
    expect(ACTION_ALLOWED.start("stopped")).toBe(true);
    expect(ACTION_ALLOWED.start("running")).toBe(false);
    expect(ACTION_ALLOWED.reboot("running")).toBe(true);
    expect(ACTION_ALLOWED.terminate("stopped")).toBe(true);
    expect(ACTION_ALLOWED.terminate("terminated")).toBe(false);
  });
});

describe("ec2Routes", () => {
  it("puts the default tab out of the URL", () => {
    expect(ec2Routes.instance("i-1")).toBe("/ec2/instances/i-1");
    expect(ec2Routes.instance("i-1", "user-data")).toBe("/ec2/instances/i-1?tab=user-data");
  });
});
