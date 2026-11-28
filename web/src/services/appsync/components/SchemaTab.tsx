import { lazy, Suspense } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { resolverRows } from "../apis.ts";
import { SCHEMA_TIMEOUT } from "../hooks/useApis.ts";
import { useResolvers } from "../hooks/useResolvers.ts";
import { useSaveSchema, useSchemaTypes } from "../hooks/useSchema.ts";
import { STARTER_SCHEMA } from "../resolverTemplates.ts";
import { ResolversTable } from "./ResolversTable.tsx";

const CodeEditor = lazy(() => import("@shared/components/CodeEditor.tsx"));
const EDITOR_HEIGHT_PX = 420;

interface Props {
  apiId: string;
  compact: boolean;
  // Giữ ở trang chi tiết: Tabs chỉ render tab đang mở, đổi tab sẽ mất bản nháp
  draft?: string;
  onDraftChange: (draft?: string) => void;
}

export function SchemaTab({ apiId, compact, draft, onDraftChange }: Props) {
  const { schema, types, typeNames } = useSchemaTypes(apiId);
  const save = useSaveSchema(apiId);
  const saved = schema.data ?? STARTER_SCHEMA;
  const text = draft ?? saved;
  // API chưa có schema: cho lưu ngay schema mẫu
  const changed = draft !== undefined ? draft !== schema.data : schema.data === null;

  const resolvers = useResolvers(apiId, typeNames);
  const rows = types
    ? resolverRows(types, resolvers.data ?? [])
    : (resolvers.data ?? []).map((resolver) => ({
        typeName: resolver.typeName ?? "",
        fieldName: resolver.fieldName ?? "",
        resolver,
        notInSchema: false,
      }));

  const submit = () =>
    save.mutate(
      text,
      // Lỗi chỉ hiện ở Alert trong khối Schema (danh sách lỗi của Floci), không thêm flash
      {
        ...notifyOutcome({
          success: "Saved schema",
          errorHeader: "Couldn't save schema",
          then: () => onDraftChange(undefined),
        }),
        onError: undefined,
      },
    );

  const header = (
    <Header
      variant='h2'
      description='Saving takes a moment: Floci checks the schema first.'
      actions={
        <Button
          variant='primary'
          disabled={!changed || !schema.isSuccess}
          loading={save.isPending}
          onClick={submit}
        >
          Save schema
        </Button>
      }
    >
      Schema
    </Header>
  );

  return (
    <SpaceBetween size='l'>
      <Container header={header}>
        <SpaceBetween size='m'>
          {save.error && (
            <Alert
              type='error'
              header={
                save.error.message === SCHEMA_TIMEOUT ? undefined : "Floci didn't accept the schema"
              }
            >
              {save.error.message.split("\n").map((line) => (
                <Box key={line}>{line}</Box>
              ))}
            </Alert>
          )}
          {schema.isLoading && <Spinner />}
          {/* Đọc lỗi (không phải "chưa có schema"): không hiện schema mẫu, lưu vào sẽ ghi đè schema thật */}
          {schema.isError && (
            <ErrorState error={schema.error} onRetry={() => void schema.refetch()} />
          )}
          {schema.isSuccess && (
            <Suspense fallback={<Spinner />}>
              <CodeEditor
                value={text}
                onChange={(value) => onDraftChange(value === schema.data ? undefined : value)}
                language='graphqlschema'
                height={EDITOR_HEIGHT_PX}
              />
            </Suspense>
          )}
        </SpaceBetween>
      </Container>
      <ResolversTable apiId={apiId} rows={rows} loading={resolvers.isLoading} compact={compact} />
    </SpaceBetween>
  );
}
