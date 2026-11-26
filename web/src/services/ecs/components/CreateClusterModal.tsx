import { useNavigate } from "react-router";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { RESOURCE_NAME_RULE } from "../constants.ts";
import { useCreateCluster } from "../hooks/useClusters.ts";
import { ecsRoutes } from "../routes.ts";
import { createClusterSchema } from "../schemas.ts";

// Chỉ mount khi mở
export function CreateClusterModal({ onDismiss }: { onDismiss: () => void }) {
  const navigate = useNavigate();
  const createCluster = useCreateCluster();
  const form = useZodForm(createClusterSchema, { name: "" });

  const submit = form.handleSubmit(({ name }) =>
    createCluster.mutate(
      name,
      notifyOutcome({
        success: `Created cluster ${name}`,
        errorHeader: `Couldn't create ${name}`,
        then: () => navigate(ecsRoutes.cluster(name)),
      }),
    ),
  );

  return (
    <FormModal
      header='Create cluster'
      actionText='Create cluster'
      loading={createCluster.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Cluster name'
        constraintText={RESOURCE_NAME_RULE}
        placeholder='app-cluster'
        autoFocus
      />
    </FormModal>
  );
}
