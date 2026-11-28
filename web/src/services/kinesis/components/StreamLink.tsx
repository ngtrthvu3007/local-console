import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useStreams } from "../hooks/useStreams.ts";
import { kinesisRoutes } from "@localconsole/core/kinesis";

// Tên stream thành link sang trang stream; dùng ở Lambda › Triggers.
// Dò bằng danh sách, không gọi DescribeStreamSummary: stream không có trả 400 → console.error (spec 7 #9)
export function StreamLink({ name }: { name: string }) {
  const streams = useStreams().data;
  const missing = streams !== undefined && !streams.some((stream) => stream.name === name);
  return <ReferenceLink name={name} href={kinesisRoutes.stream(name)} missing={missing} />;
}
