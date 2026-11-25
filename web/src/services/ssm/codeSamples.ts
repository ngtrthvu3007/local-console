import {
  lines,
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  type CodeSample,
} from "@shared/codeSamples.ts";
import { SECURE_STRING, STRING_LIST } from "./constants.ts";

const LIST_SEPARATOR = literal(",");

// SecureString cần WithDecryption (Floci trả dạng rõ cả khi thiếu, AWS thì không); StringList tách theo dấu phẩy
export function parameterSample(name: string, type?: string): CodeSample {
  const secure = type === SECURE_STRING;
  const list = type === STRING_LIST;

  return {
    node: lines(
      NODE_AWS_NOTE,
      'import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";',
      "",
      "const ssm = new SSMClient({});",
      "const { Parameter } = await ssm.send(new GetParameterCommand({",
      `  Name: ${literal(name)},`,
      ...(secure ? ["  WithDecryption: true,"] : []),
      "}));",
      list
        ? `console.log(Parameter.Value.split(${LIST_SEPARATOR}));`
        : "console.log(Parameter.Value);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import boto3",
      "",
      'ssm = boto3.client("ssm")',
      `parameter = ssm.get_parameter(Name=${literal(name)}${secure ? ", WithDecryption=True" : ""})`,
      list
        ? `print(parameter["Parameter"]["Value"].split(${LIST_SEPARATOR}))`
        : 'print(parameter["Parameter"]["Value"])',
    ),
  };
}
