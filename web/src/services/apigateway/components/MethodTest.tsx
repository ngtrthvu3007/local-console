import { lazy, Suspense, useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Textarea from "@cloudscape-design/components/textarea";
import type { Method } from "@aws-sdk/client-api-gateway";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { FUNCTION_TABS, lambdaRoutes } from "@localconsole/core/lambda";
import {
  ANY_METHOD,
  EMPTY_BODY_TEXT,
  LAMBDA_LOGS_LABEL,
  METHOD_ORDER,
  MONITOR_SUFFIX,
  NO_STAGE_HINT,
  describeIntegration,
  buildTestPath,
  parseHeaderLines,
  pathParamsOf,
  testInvokeUrl,
  sendsBody,
  type MethodTestResult,
  API_VERSIONS,
} from "@localconsole/core/apigateway";
import { useStages } from "../hooks/useApiDetail.ts";
import { useMethodTest } from "../hooks/useMethodTest.ts";
import { AWS_PROXY_PATH } from "@shared/constants.ts";

const CodeEditor = lazy(() => import("@shared/components/CodeEditor.tsx"));

const EDITOR_HEIGHT_PX = 160;
const HEADERS_ROWS = 3;
const DEFAULT_ANY_METHOD = "GET";
// ANY chỉ là cách khai báo trong API: khi gọi phải chọn một method thật
const CONCRETE_METHODS = METHOD_ORDER.filter((m) => m !== ANY_METHOD).map((m) => ({
  value: m,
  label: m,
}));

interface Props {
  apiId: string;
  path: string;
  method: Method;
}

function ResultView({ result, functionName }: { result: MethodTestResult; functionName?: string }) {
  const follow = useFollow();
  const succeeded = result.status < 400;
  const headerLines = result.headers.map(([name, value]) => `${name}: ${value}`).join("\n");

  return (
    <Alert type={succeeded ? "success" : "error"} header={`Status ${result.status}`}>
      <SpaceBetween size='m'>
        <Box color='text-body-secondary'>{`Latency: ${result.latencyMs} ms`}</Box>
        {functionName && (
          <Link href={lambdaRoutes.function(functionName, FUNCTION_TABS.monitor)} onFollow={follow}>
            {`${LAMBDA_LOGS_LABEL}${functionName}${MONITOR_SUFFIX}`}
          </Link>
        )}
        <FormField label='Response body' stretch>
          {result.body ? (
            <CodeSnippet code={result.body} wrap ariaLabel='Response body' />
          ) : (
            <Box color='text-body-secondary'>{EMPTY_BODY_TEXT}</Box>
          )}
        </FormField>
        <FormField label='Response headers' stretch>
          <CodeSnippet code={headerLines} wrap ariaLabel='Response headers' />
        </FormField>
      </SpaceBetween>
    </Alert>
  );
}

export function MethodTest({ apiId, path, method }: Props) {
  const stages = useStages(API_VERSIONS.rest, apiId);
  const test = useMethodTest();
  const integration = method.methodIntegration;
  const view = describeIntegration(integration?.type, integration?.uri);
  const functionName = view.kind === "lambda" ? view.functionName : undefined;
  const params = pathParamsOf(path);
  const declaredMethod = method.httpMethod ?? ANY_METHOD;
  const isAny = declaredMethod === ANY_METHOD;

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [anyMethod, setAnyMethod] = useState(DEFAULT_ANY_METHOD);
  const [query, setQuery] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [headersError, setHeadersError] = useState<string>();
  const [body, setBody] = useState("");

  const httpMethod = isAny ? anyMethod : declaredMethod;
  // Floci phục vụ cấu hình mới nhất trên mọi stage nên stage nào cũng cho cùng kết quả
  const stage = stages.data?.[0]?.name;
  const hasNoStage = stages.isSuccess && stage === undefined;

  const runTest = () => {
    if (stage === undefined) return;
    const parsed = parseHeaderLines(headersText);
    if ("error" in parsed) return setHeadersError(parsed.error);
    setHeadersError(undefined);
    test.mutate({
      url: testInvokeUrl(AWS_PROXY_PATH, apiId, stage, buildTestPath(path, paramValues), query),
      method: httpMethod,
      headers: parsed.headers,
      body: sendsBody(httpMethod) && body ? body : undefined,
    });
  };

  return (
    <SpaceBetween size='m'>
      <Header
        variant='h3'
        description={hasNoStage ? NO_STAGE_HINT : undefined}
        actions={
          <Button
            variant='primary'
            disabled={stage === undefined}
            loading={test.isPending}
            onClick={runTest}
          >
            Test
          </Button>
        }
      >
        Test method
      </Header>
      {isAny && (
        <FormField label='Method'>
          <Select
            options={CONCRETE_METHODS}
            selectedOption={{ value: anyMethod, label: anyMethod }}
            onChange={({ detail }) => setAnyMethod(detail.selectedOption.value ?? anyMethod)}
          />
        </FormField>
      )}
      {params.map(({ name }) => (
        <FormField key={name} label={`Path parameter: ${name}`}>
          <Input
            value={paramValues[name] ?? ""}
            onChange={({ detail }) => setParamValues((prev) => ({ ...prev, [name]: detail.value }))}
          />
        </FormField>
      ))}
      <FormField label='Query string'>
        <Input
          value={query}
          placeholder='a=1&b=2'
          onChange={({ detail }) => setQuery(detail.value)}
        />
      </FormField>
      <FormField label='Headers' errorText={headersError}>
        <Textarea
          value={headersText}
          rows={HEADERS_ROWS}
          placeholder='Header:Value on each line'
          onChange={({ detail }) => {
            setHeadersText(detail.value);
            setHeadersError(undefined);
          }}
        />
      </FormField>
      {sendsBody(httpMethod) && (
        <FormField label='Body' stretch>
          <Suspense fallback={<Spinner />}>
            <CodeEditor value={body} onChange={setBody} height={EDITOR_HEIGHT_PX} />
          </Suspense>
        </FormField>
      )}
      {stages.isError && (
        <Alert type='error' header="Couldn't load stages">
          {stages.error.message}
        </Alert>
      )}
      {test.isError && (
        <Alert type='error' header='Request failed'>
          {test.error.message}
        </Alert>
      )}
      {test.data && <ResultView result={test.data} functionName={functionName} />}
    </SpaceBetween>
  );
}
