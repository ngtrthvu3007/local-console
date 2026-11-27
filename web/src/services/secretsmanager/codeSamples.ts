import { lines } from "@localconsole/core/shared";
import { literal, NODE_AWS_NOTE, PYTHON_AWS_NOTE, type CodeSample } from "@shared/codeSamples.ts";

const KEY_VALUE_NOTE = "Key / value secret: parse the JSON string";

export const secretSample = (name: string): CodeSample => ({
  node: lines(
    NODE_AWS_NOTE,
    'import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";',
    "",
    "const secrets = new SecretsManagerClient({});",
    "const { SecretString } = await secrets.send(",
    `  new GetSecretValueCommand({ SecretId: ${literal(name)} }),`,
    ");",
    `// ${KEY_VALUE_NOTE}: JSON.parse(SecretString)`,
    "console.log(SecretString);",
  ),
  python: lines(
    PYTHON_AWS_NOTE,
    "import boto3",
    "",
    'secrets = boto3.client("secretsmanager")',
    `value = secrets.get_secret_value(SecretId=${literal(name)})["SecretString"]`,
    `# ${KEY_VALUE_NOTE}: json.loads(value)`,
    "print(value)",
  ),
});
