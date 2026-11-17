import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TEST_CREDENTIALS, consoleConfig, uniqueName, viaConsole } from "./helpers.ts";

const bucket = uniqueName("bucket");
// Key có tiếng Việt và khoảng trắng: proxy phải chuyển nguyên vẹn
const key = "uploads/ảnh mới 1.txt";
const content = "xin chào";

let s3: S3Client;
let publicS3: S3Client;

beforeAll(async () => {
  const config = await consoleConfig();
  // Giống useS3 của web: gọi qua proxy, nhưng ký URL theo địa chỉ public của Floci
  const shared = {
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  };
  s3 = new S3Client({ ...viaConsole(config.region), ...shared });
  publicS3 = new S3Client({
    ...shared,
    region: config.region,
    credentials: TEST_CREDENTIALS,
    endpoint: config.flociPublicUrl,
  });
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
});

afterAll(async () => {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
});

describe("S3 through the console proxy", () => {
  it("uploads, lists and downloads an object with a Vietnamese key", async () => {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: content, ContentType: "text/plain" }),
    );
    const listing = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "uploads/" }));
    expect(listing.Contents?.map((object) => object.Key)).toEqual([key]);
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    expect(await object.Body?.transformToString()).toBe(content);
  });

  it("signs a URL that works directly against Floci's public address", async () => {
    const url = await getSignedUrl(publicS3, new GetObjectCommand({ Bucket: bucket, Key: key }));
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(content);
  });
});
