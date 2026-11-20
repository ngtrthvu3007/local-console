// Code mẫu cho app trong thẻ Connect của từng resource: Node.js (AWS SDK v3)
// và Python (boto3), điền sẵn tên / URL / ARN của resource đó
export interface CodeSample {
  node: string;
  python: string;
}

// Chuỗi JSON cũng là chuỗi hợp lệ của JS và Python: điền tên resource an toàn
export const literal = (value: string) => JSON.stringify(value);

export const lines = (...parts: string[]) => parts.join("\n");

// SDK v3 và boto3 tự đọc AWS_ENDPOINT_URL, AWS_REGION, credential từ biến môi
// trường, nên code mẫu không ghi địa chỉ Floci (đúng cả trên máy lẫn trong
// Docker)
const AWS_ENV_NOTE = [
  "Endpoint, region and credentials come from the environment",
  "(Console Home › Connect your app)",
];
export const NODE_AWS_NOTE = lines(...AWS_ENV_NOTE.map((note) => `// ${note}`));
export const PYTHON_AWS_NOTE = lines(
  ...AWS_ENV_NOTE.map((note) => `# ${note}`),
);

// Nội dung mẫu dùng chung cho các lệnh gửi / ghi
export const SAMPLE_TEXT = "Hello from my app";

const MESSAGE_GROUP = "default";

// Queue / topic FIFO bắt buộc MessageGroupId; không bật content-based
// deduplication thì cần thêm MessageDeduplicationId mỗi lần gửi
export function fifoFields(fifo: boolean, contentBasedDedup: boolean) {
  const dedup = fifo && !contentBasedDedup;
  const group = literal(MESSAGE_GROUP);
  return {
    node: [
      ...(fifo ? [`  MessageGroupId: ${group},`] : []),
      ...(dedup ? ["  MessageDeduplicationId: crypto.randomUUID(),"] : []),
    ],
    python: [
      ...(fifo ? [`    MessageGroupId=${group},`] : []),
      ...(dedup ? ["    MessageDeduplicationId=str(uuid.uuid4()),"] : []),
    ],
    pythonImports: dedup ? ["import uuid"] : [],
  };
}
