import type { UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import Alert from "@cloudscape-design/components/alert";
import type { SelectProps } from "@cloudscape-design/components/select";
import { FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { errorMessage, notifySuccess } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { functionNameOfArn } from "../../lambda/helpers.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import { useUpdateUserPool } from "../hooks/usePools.ts";
import { triggersSchema } from "../schemas.ts";
import {
  LAMBDA_TRIGGERS,
  functionOptionArns,
  matchesFunction,
  toLambdaConfig,
  triggerSelectionOf,
} from "../triggers.ts";

const NONE_OPTION: SelectProps.Option = { value: "", label: "None" };
const MISSING_SUFFIX = " (not found)";

interface Props {
  pool: UserPoolType;
  poolId: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function EditTriggersModal({ pool, poolId, onDismiss }: Props) {
  const functions = useFunctions();
  const update = useUpdateUserPool(poolId);
  const initial = triggerSelectionOf(pool.LambdaConfig);
  const form = useZodForm(triggersSchema, initial);

  const functionArns = (functions.data ?? []).flatMap(({ FunctionArn }) =>
    FunctionArn ? [FunctionArn] : [],
  );

  // ARN có version / alias của function còn tồn tại không phải "not found"; chỉ kết luận khi đã tải xong
  const optionOf = (arn: string): SelectProps.Option => {
    const isListed = functionArns.includes(arn);
    const isMissing =
      functions.isSuccess && !functionArns.some((functionArn) => matchesFunction(arn, functionArn));

    return {
      value: arn,
      label: `${functionNameOfArn(arn)}${isMissing ? MISSING_SUFFIX : ""}`,
      description: isListed ? undefined : arn,
    };
  };

  // Giữ ARN ban đầu làm option để Save không âm thầm gỡ trigger
  const optionsOf = (currentArn: string) => [
    NONE_OPTION,
    ...functionOptionArns(functionArns, currentArn).map(optionOf),
  ];

  const submit = form.handleSubmit((values) =>
    // Key ngoài form (custom sender, KMSKeyID…) lấy từ Describe mới nhất, không từ cache
    update.mutate((fresh) => ({ LambdaConfig: toLambdaConfig(fresh.LambdaConfig, values) }), {
      onSuccess: () => {
        notifySuccess("Saved Lambda triggers");
        onDismiss();
      },
    }),
  );

  return (
    <FormModal
      header='Edit Lambda triggers'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {update.isError && <Alert type='error'>{errorMessage(update.error)}</Alert>}
      {LAMBDA_TRIGGERS.map(({ key, label }) => (
        <FormSelect
          key={key}
          control={form.control}
          name={key}
          label={label}
          options={optionsOf(initial[key])}
        />
      ))}
    </FormModal>
  );
}
