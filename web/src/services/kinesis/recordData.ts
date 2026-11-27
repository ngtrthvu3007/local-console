import type { Shard } from "@aws-sdk/client-kinesis";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { STREAM_MODES } from "./constants.ts";

interface RecordText {
  kind: "json" | "text" | "binary";
  text: string;
}

// fatal: byte không phải UTF-8 hợp lệ thì báo lỗi thay vì thay bằng �
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// Data của record là byte tùy ý: JSON thì gọn một dòng, text giữ nguyên, còn lại là binary
export function recordText(data: Uint8Array | undefined): RecordText {
  if (!data) return { kind: "text", text: "" };
  let text: string;
  try {
    text = utf8Decoder.decode(data);
  } catch {
    return { kind: "binary", text: `Binary (${data.length} bytes)` };
  }

  // Chỉ object / mảng mới là JSON: "42" hay "\"hi\"" để nguyên như text
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null)
      return { kind: "json", text: JSON.stringify(parsed) };
  } catch {
    // không phải JSON: hiện như text
  }
  return { kind: "text", text };
}

// Record do subscription filter của CloudWatch Logs gửi là gzip JSON: giải nén để Data viewer đọc được.
// Không phải gzip hoặc gzip hỏng thì giữ nguyên byte
const GZIP_MAGIC = [0x1f, 0x8b];
export async function gunzipIfGzip(data: Uint8Array): Promise<Uint8Array> {
  if (!GZIP_MAGIC.every((byte, index) => data[index] === byte)) return data;
  try {
    const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return data;
  }
}

// "arn:aws:kinesis:…:stream/clicks" → "clicks"
const STREAM_ARN_MARKER = ":stream/";
export const streamNameOfArn = (arn: string) => arn.split(STREAM_ARN_MARKER)[1] ?? NOT_AVAILABLE;

const isStreamMode = (mode: string): mode is keyof typeof STREAM_MODES => mode in STREAM_MODES;
export const streamModeLabel = (mode?: string) =>
  mode && isStreamMode(mode) ? STREAM_MODES[mode] : NOT_AVAILABLE;

// Shard đã đóng (sau split / merge) mới có số thứ tự kết thúc
export const isShardOpen = (shard: Shard) => !shard.SequenceNumberRange?.EndingSequenceNumber;
