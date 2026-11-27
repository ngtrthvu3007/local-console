import type { DistributionConfig } from "@aws-sdk/client-cloudfront";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormCheckbox, FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_ROOT_OBJECT,
  isSpa,
  withSettings,
  settingsSchema,
} from "@localconsole/core/cloudfront";
import { useUpdateDistribution } from "../hooks/useDistributions.ts";

export const SPA_TEXT = "Single-page app";
export const SPA_DESCRIPTION =
  "Serve the default root object with 200 for 403 and 404, so client-side routes load.";

interface Props {
  id: string;
  config: DistributionConfig;
  onDismiss: () => void;
}

// Chỉ mount khi mở; điền từ cấu hình trang đang có, lưu thì đọc lại cấu hình mới nhất (spec 4)
export function SettingsModal({ id, config, onDismiss }: Props) {
  const update = useUpdateDistribution(id);
  const form = useZodForm(settingsSchema, {
    description: config.Comment ?? "",
    defaultRootObject: config.DefaultRootObject ?? "",
    spa: isSpa(config),
  });

  const submit = form.handleSubmit((settings) =>
    update.mutate(
      (current) => withSettings(current, settings),
      notifyOutcome({
        success: `Saved settings of ${id}`,
        errorHeader: "Couldn't save settings",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit settings'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='m'>
        <FormInput control={form.control} name='description' label='Description' autoFocus />
        <FormInput
          control={form.control}
          name='defaultRootObject'
          label='Default root object'
          placeholder={DEFAULT_ROOT_OBJECT}
        />
        <FormCheckbox
          control={form.control}
          name='spa'
          text={SPA_TEXT}
          description={SPA_DESCRIPTION}
        />
      </SpaceBetween>
    </FormModal>
  );
}
