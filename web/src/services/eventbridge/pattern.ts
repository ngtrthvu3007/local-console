import { FLOCI_ACCOUNT_ID } from "@shared/constants.ts";
import { jsonObjectError } from "@shared/json.ts";

// Event pattern phải là object JSON; Floci nhận cả chuỗi không phải JSON nên phải tự kiểm
export function patternError(text: string): string | undefined {
  return text.trim()
    ? jsonObjectError(text, "An event pattern is a JSON object.")
    : "Enter an event pattern.";
}

const S3_SOURCE = JSON.stringify("aws.s3");

// So chuỗi JSON có ngoặc kép để tên bucket không khớp nhầm đoạn con; chưa nhận toán tử (prefix…)
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
