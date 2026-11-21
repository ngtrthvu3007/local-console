import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import { useQueues } from "../../sqs/hooks/useQueues.ts";
import { useTopics } from "../../sns/hooks/useTopics.ts";
import { useBuses } from "../hooks/useBuses.ts";
import { useAddTarget } from "../hooks/useTargets.ts";
import { addTargetSchema, type AddTargetForm } from "../schemas.ts";
import {
  ADDABLE_TARGET_KINDS,
  TARGET_KINDS,
  targetId,
  type AddableTargetKind,
} from "../targets.ts";

interface Props {
  bus: string;
  rule: string;
  onDismiss: () => void;
}

const INITIAL_VALUES: AddTargetForm = { kind: "lambda", arn: "", groupId: "" };
const KIND_OPTIONS = ADDABLE_TARGET_KINDS.map((kind) => ({
  value: kind,
  label: TARGET_KINDS[kind],
}));
const EMPTY_TEXT: Record<AddableTargetKind, string> = {
  lambda: "No functions",
  sqs: "No queues",
  sns: "No topics",
  eventbus: "No other event buses",
};

// Chỉ mount khi mở
export function AddTargetModal({ bus, rule, onDismiss }: Props) {
  const functions = useFunctions();
  const queues = useQueues();
  const topics = useTopics();
  const buses = useBuses();
  const addTarget = useAddTarget(bus, rule);

  const optionsByKind: Record<AddableTargetKind, { value: string; label: string }[]> = {
    lambda: (functions.data ?? []).map((fn) => ({
      value: fn.FunctionArn ?? "",
      label: fn.FunctionName ?? "",
    })),
    sqs: (queues.data ?? []).map((queue) => ({ value: queue.arn, label: queue.name })),
    sns: (topics.data ?? []).map((topic) => ({ value: topic.arn, label: topic.name })),
    // Không chọn chính bus của rule: event sẽ quay vòng lại
    eventbus: (buses.data ?? [])
      .filter((item) => item.name !== bus)
      .map((item) => ({ value: item.arn, label: item.name })),
  };
  const fifoArns = new Set((queues.data ?? []).filter((queue) => queue.fifo).map((q) => q.arn));

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
        id: targetId(values.kind, values.arn),
        messageGroupId: fifoArns.has(values.arn) ? values.groupId : undefined,
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
      <FormSelect control={form.control} name='kind' label='Type' options={KIND_OPTIONS} />
      <FormSelect
        control={form.control}
        name='arn'
        label={TARGET_KINDS[kind]}
        placeholder='Choose a resource'
        empty={EMPTY_TEXT[kind]}
        options={optionsByKind[kind]}
      />
      {fifoArns.has(arn) && (
        <FormInput control={form.control} name='groupId' label='Message group ID' />
      )}
    </FormModal>
  );
}
