import { lines } from "@localconsole/core/shared";
import {
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  SAMPLE_TEXT,
  type CodeSample,
} from "@shared/codeSamples.ts";

const SAMPLE_KEY = "hello.txt";
// Floci phục vụ bucket theo đường dẫn, không theo subdomain: thiếu là lỗi DNS
const PATH_STYLE_NOTE = "Floci serves buckets on a path, not a subdomain";

export const bucketSample = (bucket: string): CodeSample => ({
  node: lines(
    NODE_AWS_NOTE,
    "import {",
    "  S3Client,",
    "  PutObjectCommand,",
    "  GetObjectCommand,",
    '} from "@aws-sdk/client-s3";',
    "",
    `// ${PATH_STYLE_NOTE}`,
    "const s3 = new S3Client({ forcePathStyle: true });",
    `const Bucket = ${literal(bucket)};`,
    `const Key = ${literal(SAMPLE_KEY)};`,
    "",
    `const Body = ${literal(SAMPLE_TEXT)};`,
    "await s3.send(new PutObjectCommand({ Bucket, Key, Body }));",
    "const object = await s3.send(new GetObjectCommand({ Bucket, Key }));",
    "console.log(await object.Body.transformToString());",
  ),
  python: lines(
    PYTHON_AWS_NOTE,
    "import boto3",
    "from botocore.config import Config",
    "",
    `# ${PATH_STYLE_NOTE}`,
    's3 = boto3.client("s3", config=Config(s3={"addressing_style": "path"}))',
    `bucket = ${literal(bucket)}`,
    `key = ${literal(SAMPLE_KEY)}`,
    "",
    `body = ${literal(SAMPLE_TEXT)}.encode()`,
    "s3.put_object(Bucket=bucket, Key=key, Body=body)",
    'print(s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode())',
  ),
});
