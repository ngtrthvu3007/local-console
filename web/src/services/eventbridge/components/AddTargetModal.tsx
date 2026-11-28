import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { TARGET_KIND_OPTIONS, useAddTarget, useTargetOptions } from "../hooks/useTargets.ts";
import {
  addTargetSchema,
  type AddTargetForm,
  TARGET_KINDS,
  targetId,
} from "@localconsole/core/eventbridge";
import { ECS_TARGET_NAMES, EcsTargetFields, ecsTargetOf } from "./EcsTargetFields.tsx";

interface Props {
  bus: string;
  rule: string;
  onDismiss: () => void;
}

const INITIAL_VALUES: AddTargetForm = {
  kind: "lambda",
  arn: "",
  groupId: "",
  taskFamily: "",
  taskRevision: "",
  subnets: [],
  securityGroups: [],
};

// Chỉ mount khi mở
export function AddTargetModal({ bus, rule, onDismiss }: Props) {
  const addTarget = useAddTarget(bus, rule);
  const { region } = useLoadedConfig();
  const { optionsByKind, emptyText, fifoArns } = useTargetOptions(bus);
  const form = useZodForm(addTargetSchema(fifoArns), INITIAL_VALUES);
  const [kind, arn] = useWatch({ control: form.control, name: ["kind", "arn"] });

  // Đổi loại thì bỏ resource đã chọn của loại cũ
  useEffect(() => {
    form.setValue("arn", "");
  }, [kind, form]);

  const submit = form.handleSubmit((values) =>
    addTarget.mutate(
      {
        arn: values.arn,
        id: targetId(
          values.kind,
          values.arn,
          values.kind === "ecs" ? values.taskFamily : undefined,
        ),
        messageGroupId: fifoArns.has(values.arn) ? values.groupId : undefined,
        ecs: values.kind === "ecs" ? ecsTargetOf(values, region) : undefined,
      },
      notifyOutcome({
        success: "Added target",
        errorHeader: "Couldn't add the target",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Add target'
      actionText='Add target'
      loading={addTarget.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect control={form.control} name='kind' label='Type' options={TARGET_KIND_OPTIONS} />
      <FormSelect
        control={form.control}
        name='arn'
        label={TARGET_KINDS[kind]}
        placeholder='Choose a resource'
        empty={emptyText[kind]}
        options={optionsByKind[kind]}
      />
      {fifoArns.has(arn) && (
        <FormInput control={form.control} name='groupId' label='Message group ID' />
      )}
      {kind === "ecs" && <EcsTargetFields control={form.control} names={ECS_TARGET_NAMES} />}
    </FormModal>
  );
}
