import { queueNameOfUrl } from "../sqs/queues.ts";

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

  for (const stack of stacks) {
    for (const { type, physicalId } of stack.resources) {
      const key = indexKey(type, physicalId);
      if (!index.has(key)) index.set(key, stack.name);
    }
  }

  return index;
}
