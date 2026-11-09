import type { EditorLanguage } from "@shared/components/CodeEditor.tsx";

// Ngôn ngữ sửa được ngay trên trang (runtime biên dịch như Java, .NET thì không)
export type InlineLanguage = Extract<EditorLanguage, "javascript" | "python">;

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

// Code "Hello world" giống code mẫu của AWS Console, có ghi log để thấy ở tab Monitor
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

// Mode của editor theo đuôi file; file text khác hiện dạng chữ thường
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

// "index.handler" → "index"; "src/app.main" → "src/app"
export const handlerModuleOf = (handler = "") =>
  handler.slice(0, handler.lastIndexOf(EXTENSION_SEPARATOR));
