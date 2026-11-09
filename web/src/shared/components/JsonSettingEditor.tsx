import { lazy, Suspense, useEffect, useState } from "react";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { jsonError } from "../json.ts";
import { ConfirmModal } from "./ConfirmModal.tsx";
import { ErrorState, type FailableQuery } from "./TableStates.tsx";

const CodeEditor = lazy(() => import("./CodeEditor.tsx"));

interface Props {
  title: string;
  description: string;
  // Giá trị đang lưu; null = chưa cấu hình
  savedText: string | null;
  query: FailableQuery & { isLoading: boolean };
  saving: boolean;
  exampleText: string;
  onSave: (text: string) => void;
  onDelete: (then: () => void) => void; // `then` chạy khi xóa xong
  validate?: (value: unknown) => string | undefined; // kiểm tra thêm khi JSON đã hợp lệ
}

// Khối cấu hình JSON: sửa, lưu, xóa, chèn mẫu
export function JsonSettingEditor({
  title,
  description,
  savedText,
  query,
  saving,
  exampleText,
  onSave,
  onDelete,
  validate,
}: Props) {
  const [draft, setDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => setDraft(savedText ?? ""), [savedText]);

  const error =
    jsonError(draft) ?? (draft.trim() && validate ? validate(JSON.parse(draft)) : undefined);
  const changed = draft !== (savedText ?? "");
  // Tải lỗi thì không biết đang lưu gì: khóa mọi nút để không ghi đè cấu hình thật
  const locked = query.isLoading || query.isError;

  const body = query.isLoading ? (
    <Spinner />
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => query.refetch()} />
  ) : (
    <FormField stretch errorText={error}>
      <Suspense fallback={<Spinner />}>
        <CodeEditor value={draft} onChange={setDraft} />
      </Suspense>
    </FormField>
  );

  return (
    <Container
      header={
        <Header
          variant='h2'
          description={description}
          actions={
            <SpaceBetween direction='horizontal' size='xs'>
              <Button disabled={locked} onClick={() => setDraft(exampleText)}>
                Insert example
              </Button>
              <Button
                disabled={locked || savedText === null}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
              <Button
                variant='primary'
                disabled={locked || !changed || !draft.trim() || Boolean(error)}
                loading={saving}
                onClick={() => onSave(draft)}
              >
                Save changes
              </Button>
            </SpaceBetween>
          }
        >
          {title}
        </Header>
      }
    >
      {body}
      <ConfirmModal
        visible={confirmingDelete}
        header={`Delete ${title.toLowerCase()}?`}
        actionText='Delete'
        loading={saving}
        onDismiss={() => setConfirmingDelete(false)}
        onConfirm={() => onDelete(() => setConfirmingDelete(false))}
      />
    </Container>
  );
}
