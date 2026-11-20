import {
  lines,
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  type CodeSample,
} from "@shared/codeSamples.ts";

const ASYNC_NOTE = "Asynchronous call: add InvocationType";

export const functionSample = (name: string): CodeSample => ({
  node: lines(
    NODE_AWS_NOTE,
    'import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";',
    "",
    "const lambda = new LambdaClient({});",
    "const result = await lambda.send(new InvokeCommand({",
    `  FunctionName: ${literal(name)},`,
    '  Payload: JSON.stringify({ hello: "world" }),',
    `  // ${ASYNC_NOTE}: "Event"`,
    "}));",
    "console.log(new TextDecoder().decode(result.Payload));",
  ),
  python: lines(
    PYTHON_AWS_NOTE,
    "import json",
    "import boto3",
    "",
    'lambda_client = boto3.client("lambda")',
    "result = lambda_client.invoke(",
    `    FunctionName=${literal(name)},`,
    '    Payload=json.dumps({"hello": "world"}),',
    `    # ${ASYNC_NOTE}="Event"`,
    ")",
    'print(result["Payload"].read().decode())',
  ),
});
