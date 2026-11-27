import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  API_TYPES,
  apiSchema,
  type ApiDetail,
  type ApiVersion,
} from "@localconsole/core/apigateway";
import { useUpdateApi } from "../hooks/useApis.ts";

interface Props {
  version: ApiVersion;
  apiId: string;
  api: ApiDetail;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function EditApiModal({ version, apiId, api, onDismiss }: Props) {
  const updateApi = useUpdateApi(version, apiId);
  const form = useZodForm(apiSchema, {
    type: api.type,
    name: api.name,
    description: api.description ?? "",
    functionArn: "",
    grant: false,
    routeSelection: api.routeSelection ?? "",
  });

  const submit = form.handleSubmit((values) =>
    updateApi.mutate(
      values,
      notifyOutcome({
        success: `Saved API ${values.name}`,
        errorHeader: `Couldn't save ${values.name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit API'
      actionText='Save'
      loading={updateApi.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='name' label='Name' autoFocus />
      {api.type === API_TYPES.websocket ? (
        <FormInput
          control={form.control}
          name='routeSelection'
          label='Route selection expression'
        />
      ) : (
        <FormInput control={form.control} name='description' label='Description - optional' />
      )}
    </FormModal>
  );
}
