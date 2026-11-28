import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  API_TYPES,
  API_VERSIONS,
  DEFAULT_KEY,
  stageSchema,
  type ApiType,
  type ApiVersion,
} from "@localconsole/core/apigateway";
import { useCreateStage, useDeleteStage } from "../hooks/useApiDetail.ts";

interface StageProps {
  version: ApiVersion;
  apiId: string;
  onDismiss: () => void;
}

const NAME_RULE = "Letters, numbers, hyphens (-) and underscores (_).";

// Chỉ mount khi mở
export function CreateStageModal({
  version,
  apiId,
  apiType,
  existing,
  onDismiss,
}: StageProps & { apiType: ApiType; existing: readonly string[] }) {
  const createStage = useCreateStage(version, apiId);
  const form = useZodForm(stageSchema(apiType, existing), { name: "" });
  const http = apiType === API_TYPES.http;

  const submit = form.handleSubmit(({ name }) =>
    createStage.mutate(
      // HTTP API tự deploy như AWS console; REST / WebSocket Floci luôn chạy cấu hình mới nhất
      { name, autoDeploy: http },
      notifyOutcome({
        success: `Created stage ${name}`,
        errorHeader: `Couldn't create stage ${name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Create stage'
      actionText='Create'
      loading={createStage.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Stage name'
        constraintText={http ? `${NAME_RULE} Or ${DEFAULT_KEY}.` : NAME_RULE}
        placeholder='dev'
        autoFocus
      />
    </FormModal>
  );
}

// Chỉ mount khi mở
export function DeleteStageModal({
  version,
  apiId,
  name,
  onDismiss,
  onDone,
}: StageProps & { name: string; onDone: () => void }) {
  const deleteStage = useDeleteStage(version, apiId);

  const submit = () =>
    deleteStage.mutate(
      name,
      notifyOutcome({
        success: `Deleted stage ${name}`,
        errorHeader: `Couldn't delete stage ${name}`,
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete stage ${name}?`}
      actionText='Delete'
      loading={deleteStage.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {/* v2 trên Floci bỏ qua stage (spec gốc 7 #3): chỉ REST mất invoke URL */}
      {version === API_VERSIONS.rest && "Its invoke URLs stop working."}
    </ConfirmModal>
  );
}
