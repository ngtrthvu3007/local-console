import { FLOCI_ACCOUNT_ID } from "@shared/constants.ts";
import { jsonObjectError } from "@shared/json.ts";

// Event pattern phải là object JSON; Floci nhận cả chuỗi không phải JSON nên phải tự kiểm
export function patternError(text: string): string | undefined {
  return text.trim()
    ? jsonObjectError(text, "An event pattern is a JSON object.")
    : "Enter an event pattern.";
}

const S3_SOURCE = JSON.stringify("aws.s3");

// Rule bắt event S3 của bucket này: source có aws.s3 và pattern không lọc bucket, hoặc nhắc đúng tên
// bucket. So chuỗi JSON có trích dẫn nên tên bucket không khớp nhầm đoạn con; toán tử trong bộ lọc
// bucket (prefix…) không được nhận ra
export function matchesS3Bucket(eventPattern: string | undefined, bucket: string): boolean {
  const pattern = eventPattern ?? "";
  return (
    pattern.includes(S3_SOURCE) &&
    (!pattern.includes('"bucket"') || pattern.includes(JSON.stringify(bucket)))
  );
}

// TestEventPattern đòi event đủ trường của envelope; dev chỉ viết source, detail-type, detail
export function wrapSampleEvent(text: string, region: string, now = new Date()): string {
  const sample = JSON.parse(text) as Record<string, unknown>;
  return JSON.stringify({
    id: crypto.randomUUID(),
    account: FLOCI_ACCOUNT_ID,
    time: now.toISOString(),
    region,
    resources: [],
    ...sample,
  });
}
