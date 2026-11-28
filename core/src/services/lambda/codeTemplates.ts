import type { EditorLanguage } from "#shared/types/editorLanguage.ts";

// Ngôn ngữ sửa được ngay trên trang (runtime biên dịch như Java, .NET thì không)
type InlineLanguage = Extract<EditorLanguage, "javascript" | "python">;

const NODEJS_RUNTIME_PREFIX = "nodejs";
const PYTHON_RUNTIME_PREFIX = "python";

export const inlineLanguageOf = (runtime = ""): InlineLanguage | undefined =>
  runtime.startsWith(NODEJS_RUNTIME_PREFIX)
    ? "javascript"
    : runtime.startsWith(PYTHON_RUNTIME_PREFIX)
      ? "python"
      : undefined;

interface CodeTemplate {
  fileName: string;
  handler: string;
  code: string;
}

export const CODE_TEMPLATES: Record<InlineLanguage, CodeTemplate> = {
  javascript: {
    fileName: "index.mjs",
    handler: "index.handler",
    code: `export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));
  return {
    statusCode: 200,
    body: JSON.stringify("Hello from Lambda!"),
  };
};
`,
  },
  python: {
    fileName: "lambda_function.py",
    handler: "lambda_function.lambda_handler",
    code: `import json


def lambda_handler(event, context):
    print("Received event:", json.dumps(event))
    return {
        "statusCode": 200,
        "body": json.dumps("Hello from Lambda!"),
    }
`,
  },
};

const EXTENSION_LANGUAGES: Record<string, EditorLanguage> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  json: "json",
};

const PLAIN_TEXT_LANGUAGE = "text";
const EXTENSION_SEPARATOR = ".";

export const editorLanguageOf = (path: string) =>
  EXTENSION_LANGUAGES[path.split(EXTENSION_SEPARATOR).pop() ?? ""] ?? PLAIN_TEXT_LANGUAGE;

export const handlerModuleOf = (handler = "") =>
  handler.slice(0, handler.lastIndexOf(EXTENSION_SEPARATOR));
