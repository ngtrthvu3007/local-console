import { FormInput, FormRadioGroup } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { formatDuration, isWholeNumberIn } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useSetTtl } from "../hooks/useRedis.ts";
import { TTL_MODES, TTL_SECONDS, ttlSchema } from "../redisSchemas.ts";

interface Props {
  cluster: string;
  name: string;
  ttl: number | null; // TTL hiện tại, điền sẵn
  onDismiss: () => void;
}

const MODE_ITEMS = [
  { value: TTL_MODES.none, label: "No expiry" },
  { value: TTL_MODES.expire, label: "Expire in" },
];

// Chỉ mount khi mở
export function TtlModal({ cluster, name, ttl, onDismiss }: Props) {
  const setTtl = useSetTtl(cluster, name);

  const form = useZodForm(ttlSchema, {
    mode: ttl === null ? TTL_MODES.none : TTL_MODES.expire,
    seconds: ttl === null ? "" : String(ttl),
  });

  const mode = form.watch("mode");
  const secondsText = form.watch("seconds").trim();

  const readable = isWholeNumberIn(secondsText, TTL_SECONDS)
    ? formatDuration(Number(secondsText))
    : "";

  const submit = form.handleSubmit((input) =>
    setTtl.mutate(
      input,
      notifyOutcome({
        success: input.seconds === null ? `Removed the TTL of ${name}` : `Set the TTL of ${name}`,
        errorHeader: `Couldn't set the TTL of ${name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Set TTL'
      actionText='Save'
      loading={setTtl.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormRadioGroup control={form.control} name='mode' items={MODE_ITEMS} />
      {mode === TTL_MODES.expire && (
        <FormInput
          control={form.control}
          name='seconds'
          label='Seconds'
          constraintText={readable ? `= ${readable}` : "Whole seconds, for example 3600."}
          placeholder='3600'
          autoFocus
        />
      )}
    </FormModal>
  );
}
