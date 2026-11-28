import { lines } from "@localconsole/core/shared";
import { literal, NODE_AWS_NOTE, PYTHON_AWS_NOTE, type CodeSample } from "@shared/codeSamples.ts";
import { DEFAULT_INVALIDATION_PATH } from "@localconsole/core/cloudfront";

const NO_CACHE_NOTE = "Floci doesn't cache: the invalidation completes at once";

// Bước cuối của script deploy frontend: invalidate cả distribution sau khi upload lên S3
export function distributionSample(id: string): CodeSample {
  const path = literal(DEFAULT_INVALIDATION_PATH);

  return {
    node: lines(
      NODE_AWS_NOTE,
      `// ${NO_CACHE_NOTE}`,
      'import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";',
      "",
      "const cloudfront = new CloudFrontClient({});",
      "await cloudfront.send(new CreateInvalidationCommand({",
      `  DistributionId: ${literal(id)},`,
      "  InvalidationBatch: {",
      "    CallerReference: String(Date.now()),",
      `    Paths: { Quantity: 1, Items: [${path}] },`,
      "  },",
      "}));",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      `# ${NO_CACHE_NOTE}`,
      "import time",
      "import boto3",
      "",
      'cloudfront = boto3.client("cloudfront")',
      "cloudfront.create_invalidation(",
      `    DistributionId=${literal(id)},`,
      "    InvalidationBatch={",
      '        "CallerReference": str(time.time()),',
      `        "Paths": {"Quantity": 1, "Items": [${path}]},`,
      "    },",
      ")",
    ),
  };
}
