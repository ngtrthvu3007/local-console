import { useNavigate } from "react-router";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_EXECUTION_INPUT,
  EDITOR_HEIGHT_PX,
  EXECUTION_NAME_MAX_LENGTH,
} from "../constants.ts";
import { useStartExecution } from "../hooks/useExecutions.ts";
import { stepfunctionsRoutes } from "../routes.ts";
import { startExecutionSchema } from "../schemas.ts";

interface Props {
  machineArn: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở. Chạy xong mở thẳng chi tiết execution (spec 3.3)
export function StartExecutionModal({ machineArn, onDismiss }: Props) {
  const navigate = useNavigate();
  const start = useStartExecution(machineArn);
  const form = useZodForm(startExecutionSchema, { name: "", input: DEFAULT_EXECUTION_INPUT });

  const submit = form.handleSubmit((values) =>
    start.mutate(
      values,
      notifyOutcome({
        success: "Started execution",
        errorHeader: "Couldn't start the execution",
        then: (executionArn) => navigate(stepfunctionsRoutes.execution(executionArn)),
      }),
    ),
  );

  return (
    <FormModal
      header='Start execution'
      actionText='Start execution'
      loading={start.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Name'
        description={`Optional, up to ${EXECUTION_NAME_MAX_LENGTH} characters. Leave empty for a generated ID.`}
      />
      <FormValueEditor
        control={form.control}
        name='input'
        label='Input'
        height={EDITOR_HEIGHT_PX}
      />
    </FormModal>
  );
}
