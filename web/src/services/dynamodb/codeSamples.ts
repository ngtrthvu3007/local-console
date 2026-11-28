import { lines } from "@localconsole/core/shared";
import {
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  SAMPLE_TEXT,
  type CodeSample,
} from "@shared/codeSamples.ts";
import type { KeyType, KeyAttribute } from "@localconsole/core/dynamodb";

const SAMPLE_VALUE = "example";
const SAMPLE_NUMBER = "1";
const NOTE_ATTRIBUTE = "note";

// Giá trị mẫu cho key theo kiểu: chuỗi, số, binary (mỗi ngôn ngữ viết khác)
const NODE_VALUES: Record<KeyType, string> = {
  S: literal(SAMPLE_VALUE),
  N: SAMPLE_NUMBER,
  B: `Buffer.from(${literal(SAMPLE_VALUE)})`,
};
const PYTHON_VALUES: Record<KeyType, string> = {
  S: literal(SAMPLE_VALUE),
  N: SAMPLE_NUMBER,
  B: `${literal(SAMPLE_VALUE)}.encode()`,
};

const keyObject = (keys: KeyAttribute[], values: Record<KeyType, string>) =>
  `{ ${keys.map((key) => `${literal(key.name)}: ${values[key.type]}`).join(", ")} }`;

// Document client (lib-dynamodb / resource Table): item là object thường, không
// phải dạng { S: "…" } của API gốc
export function tableSample(table: string, keys: KeyAttribute[]): CodeSample {
  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { DynamoDBClient } from "@aws-sdk/client-dynamodb";',
      "import {",
      "  DynamoDBDocumentClient,",
      "  PutCommand,",
      "  GetCommand,",
      '} from "@aws-sdk/lib-dynamodb";',
      "",
      "const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));",
      `const TableName = ${literal(table)};`,
      `const Key = ${keyObject(keys, NODE_VALUES)};`,
      "",
      "await db.send(new PutCommand({",
      "  TableName,",
      `  Item: { ...Key, ${NOTE_ATTRIBUTE}: ${literal(SAMPLE_TEXT)} },`,
      "}));",
      "const { Item } = await db.send(new GetCommand({ TableName, Key }));",
      "console.log(Item);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      `table = boto3.resource("dynamodb").Table(${literal(table)})`,
      `key = ${keyObject(keys, PYTHON_VALUES)}`,
      "",
      `table.put_item(Item={**key, ${literal(NOTE_ATTRIBUTE)}: ${literal(SAMPLE_TEXT)}})`,
      'print(table.get_item(Key=key).get("Item"))',
    ),
  };
}
