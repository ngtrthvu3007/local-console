import { queueNameOfUrl } from "#services/sqs/queues.ts";

interface StackResourceRef {
  type: string;
  physicalId: string;
}

export interface StackWithResources {
  name: string;
  resources: readonly StackResourceRef[];
}

const SQS_QUEUE_TYPE = "AWS::SQS::Queue";
const KEY_SEPARATOR = "|";

// SQS: physical ID là URL, trang queue dùng tên
export const indexKey = (type: string, physicalId: string) =>
  [type, type === SQS_QUEUE_TYPE ? queueNameOfUrl(physicalId) : physicalId].join(KEY_SEPARATOR);

// (type, physical ID) → tên stack. Stack nào gặp trước giữ chỗ
export function buildResourceIndex(stacks: readonly StackWithResources[]): Map<string, string> {
  const index = new Map<string, string>();
  const entries = stacks.flatMap((stack) =>
    stack.resources.map(
      ({ type, physicalId }) => [indexKey(type, physicalId), stack.name] as const,
    ),
  );

  for (const [key, stackName] of entries) if (!index.has(key)) index.set(key, stackName);

  return index;
}
