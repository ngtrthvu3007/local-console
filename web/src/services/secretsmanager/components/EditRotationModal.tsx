import { useWatch } from "react-hook-form";
import type { DescribeSecretResponse } from "@aws-sdk/client-secrets-manager";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormInput,
  FormSelect,
  FormTiles,
  FormToggle,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import {
  ROTATION_DAYS,
  SCHEDULE_TYPES,
  rotationFormValues,
  rotationSchema,
} from "@localconsole/core/secretsmanager";
import { useCancelRotation, useConfigureRotation } from "../hooks/useSecrets.ts";

const SCHEDULE_ITEMS = [
  { value: "days", label: SCHEDULE_TYPES.days, description: "Rotate every N days." },
  {
    value: "expression",
    label: SCHEDULE_TYPES.expression,
    description: "A rate(…) or cron(…) expression.",
  },
];

interface Props {
  name: string;
  secret: DescribeSecretResponse;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function EditRotationModal({ name, secret, onDismiss }: Props) {
  const functions = useFunctions();
  const configure = useConfigureRotation(name);
  const cancel = useCancelRotation(name);
  const form = useZodForm(rotationSchema, rotationFormValues(secret));

  const [enabled, scheduleType] = useWatch({
    control: form.control,
    name: ["enabled", "scheduleType"],
  });

  const outcome = notifyOutcome({
    success: `Updated rotation of ${name}`,
    errorHeader: "Couldn't update rotation",
    then: onDismiss,
  });

  // Tắt mà vốn đang tắt thì không có gì để gửi
  const submit = form.handleSubmit((values) => {
    if (values.enabled) return configure.mutate(values, outcome);
    if (secret.RotationEnabled) return cancel.mutate(undefined, outcome);
    onDismiss();
  });

  const functionOptions = (functions.data ?? []).map((fn) => ({
    value: fn.FunctionArn ?? "",
    label: fn.FunctionName,
  }));

  return (
    <FormModal
      header='Edit rotation'
      actionText='Save'
      loading={configure.isPending || cancel.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='l'>
        <FormToggle control={form.control} name='enabled' text='Automatic rotation' />
        {enabled && (
          // Cụm lồng để SpaceBetween ngoài vẫn chia khoảng giữa từng ô (fragment bị coi là một)
          <SpaceBetween size='l'>
            <FormSelect
              control={form.control}
              name='lambdaArn'
              label='Rotation function'
              description='Called with the createSecret, setSecret, testSecret and finishSecret steps.'
              placeholder='Choose a function'
              options={functionOptions}
              empty={functions.isLoading ? "Loading functions" : "No functions"}
            />
            <FormTiles
              control={form.control}
              name='scheduleType'
              label='Rotation schedule'
              items={SCHEDULE_ITEMS}
            />
            {scheduleType === "days" ? (
              <FormInput
                control={form.control}
                name='days'
                label='Days'
                type='number'
                constraintText={`From ${ROTATION_DAYS.min} to ${ROTATION_DAYS.max}.`}
              />
            ) : (
              <FormInput
                control={form.control}
                name='expression'
                label='Schedule expression'
                placeholder='cron(0 12 * * ? *)'
              />
            )}
          </SpaceBetween>
        )}
      </SpaceBetween>
    </FormModal>
  );
}
