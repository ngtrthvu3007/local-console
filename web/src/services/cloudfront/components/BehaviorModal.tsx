import type { CacheBehavior, DistributionConfig } from "@aws-sdk/client-cloudfront";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { DEFAULT_BEHAVIOR_LABEL, DEFAULT_BEHAVIOR_PATH } from "../constants.ts";
import { behaviorsOf, originsOf, withBehavior } from "../distributions.ts";
import { useUpdateDistribution } from "../hooks/useDistributions.ts";
import { behaviorSchema } from "../schemas.ts";

interface Props {
  distributionId: string;
  config: DistributionConfig;
  behavior?: CacheBehavior; // có = sửa
  onDismiss: () => void;
}

// Chỉ mount khi mở. Behavior mới thêm cuối (trước Default); sửa chỉ đổi path và origin (spec 3.5)
export function BehaviorModal({ distributionId, config, behavior, onDismiss }: Props) {
  const update = useUpdateDistribution(distributionId);
  const originalPath = behavior?.PathPattern;
  const editingDefault = originalPath === DEFAULT_BEHAVIOR_PATH;
  const otherPaths = behaviorsOf(config).flatMap(({ PathPattern }) =>
    PathPattern && PathPattern !== DEFAULT_BEHAVIOR_PATH && PathPattern !== originalPath
      ? [PathPattern]
      : [],
  );
  // Behavior mới mặc định trỏ origin đầu tiên
  const firstOriginId = originsOf(config)[0]?.Id ?? "";
  const form = useZodForm(behaviorSchema(otherPaths, editingDefault), {
    path: originalPath ?? "",
    originId: behavior?.TargetOriginId ?? firstOriginId,
  });
  const name = editingDefault ? DEFAULT_BEHAVIOR_LABEL : originalPath;

  const submit = form.handleSubmit(({ path, originId }) =>
    update.mutate(
      (latest) => withBehavior(latest, { originalPath, path, originId }),
      notifyOutcome({
        success: `Saved behavior ${editingDefault ? DEFAULT_BEHAVIOR_LABEL : path}`,
        errorHeader: "Couldn't save behavior",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={behavior ? `Edit behavior ${name}` : "Create behavior"}
      actionText={behavior ? "Save" : "Create behavior"}
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='m'>
        {!editingDefault && (
          <FormInput
            control={form.control}
            name='path'
            label='Path pattern'
            placeholder='/api/*'
            description='Floci matches behaviors in order, like CloudFront: put specific paths first.'
            autoFocus
          />
        )}
        <FormSelect
          control={form.control}
          name='originId'
          label='Origin'
          options={originsOf(config).map(({ Id = "" }) => ({ value: Id, label: Id }))}
        />
      </SpaceBetween>
    </FormModal>
  );
}
