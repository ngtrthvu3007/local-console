import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { resourceSchema, type ResourceNode } from "@localconsole/core/apigateway";
import { useCreateResource, useDeleteMethod, useDeleteResource } from "../hooks/useApiDetail.ts";

// Chỉ mount khi mở. onCreated nhận ID resource mới để chọn luôn
export function CreateResourceModal({
  apiId,
  parent,
  onDismiss,
  onCreated,
}: {
  apiId: string;
  parent: ResourceNode;
  onDismiss: () => void;
  onCreated: (resourceId: string) => void;
}) {
  const createResource = useCreateResource(apiId);
  const form = useZodForm(resourceSchema(parent.children.map((child) => child.pathPart)), {
    pathPart: "",
  });

  const submit = form.handleSubmit(({ pathPart }) =>
    createResource.mutate(
      { parentId: parent.id, pathPart },
      notifyOutcome({
        success: `Created resource ${pathPart}`,
        errorHeader: `Couldn't create resource ${pathPart}`,
        then: onCreated,
      }),
    ),
  );

  return (
    <FormModal
      header='Create resource'
      actionText='Create'
      loading={createResource.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='pathPart'
        label='Path part'
        description={`Under ${parent.path}`}
        constraintText='Letters, numbers, periods (.), hyphens (-) and underscores (_). {name} for a path variable, {name+} for the rest of the path.'
        placeholder='items'
        autoFocus
      />
    </FormModal>
  );
}

interface DeleteProps {
  apiId: string;
  resource: { id: string; path: string };
  onDismiss: () => void;
  onDone: () => void;
}

// Chỉ mount khi mở
export function DeleteResourceModal({ apiId, resource, onDismiss, onDone }: DeleteProps) {
  const deleteResource = useDeleteResource(apiId);

  return (
    <ConfirmModal
      visible
      header={`Delete resource ${resource.path}?`}
      actionText='Delete'
      loading={deleteResource.isPending}
      onConfirm={() =>
        deleteResource.mutate(
          resource.id,
          notifyOutcome({
            success: `Deleted resource ${resource.path}`,
            errorHeader: `Couldn't delete resource ${resource.path}`,
            then: onDone,
          }),
        )
      }
      onDismiss={onDismiss}
    >
      Its methods are deleted too.
    </ConfirmModal>
  );
}

// Chỉ mount khi mở
export function DeleteMethodModal({
  apiId,
  resource,
  httpMethod,
  onDismiss,
  onDone,
}: DeleteProps & { httpMethod: string }) {
  const deleteMethod = useDeleteMethod(apiId);
  const label = `${httpMethod} ${resource.path}`;

  return (
    <ConfirmModal
      visible
      header={`Delete method ${label}?`}
      actionText='Delete'
      loading={deleteMethod.isPending}
      onConfirm={() =>
        deleteMethod.mutate(
          { resourceId: resource.id, httpMethod },
          notifyOutcome({
            success: `Deleted method ${label}`,
            errorHeader: `Couldn't delete method ${label}`,
            then: onDone,
          }),
        )
      }
      onDismiss={onDismiss}
    >
      Calls to it stop working.
    </ConfirmModal>
  );
}
