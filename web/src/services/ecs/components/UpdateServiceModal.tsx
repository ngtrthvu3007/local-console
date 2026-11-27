import type { Service } from "@aws-sdk/client-ecs";
import Box from "@cloudscape-design/components/box";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { taskDefinitionRefOf } from "../arns.ts";
import { ROLLING_UPDATE_NOTE } from "../constants.ts";
import { useUpdateService } from "../hooks/useServices.ts";
import { updateServiceSchema } from "../schemas.ts";
import { TaskDefinitionFields } from "./TaskDefinitionFields.tsx";

interface Props {
  cluster: string;
  service: Service;
  onDismiss: () => void;
}

const DEFINITION_NAMES = { family: "family", revision: "revision" } as const;

// Chỉ mount khi mở. Đổi family cũng được (AWS cho phép), mặc định là family đang chạy
export function UpdateServiceModal({ cluster, service, onDismiss }: Props) {
  const name = service.serviceName ?? "";
  const current = taskDefinitionRefOf(service.taskDefinition ?? "");
  const update = useUpdateService(cluster, name);
  const form = useZodForm(updateServiceSchema, {
    desiredCount: String(service.desiredCount ?? 0),
    family: current.family,
    revision: String(current.revision),
  });

  const submit = form.handleSubmit((values) =>
    update.mutate(
      {
        desiredCount: values.desiredCount,
        taskDefinition: `${values.family}:${values.revision}`,
      },
      notifyOutcome({
        success: `Updated ${name}`,
        errorHeader: `Couldn't update ${name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={`Update ${name}`}
      actionText='Update'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='desiredCount'
        label='Desired tasks'
        constraintText='0 stops every task and keeps the service.'
        autoFocus
      />
      <TaskDefinitionFields control={form.control} names={DEFINITION_NAMES} />
      <Box color='text-body-secondary'>{ROLLING_UPDATE_NOTE}</Box>
    </FormModal>
  );
}
