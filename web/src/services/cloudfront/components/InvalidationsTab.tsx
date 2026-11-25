import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { InvalidationSummary } from "@aws-sdk/client-cloudfront";
import Alert from "@cloudscape-design/components/alert";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { FormTextarea } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { formatDate } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { DEFAULT_INVALIDATION_PATH, INVALIDATION_COMPLETED } from "../constants.ts";
import { useCreateInvalidation, useInvalidations } from "../hooks/useInvalidations.ts";
import { invalidationSchema } from "../schemas.ts";

const CREATED_FIELD = "CreateTime";
const PATHS_ROWS = 4;

// Chỉ mount khi mở
function CreateInvalidationModal({ id, onDismiss }: { id: string; onDismiss: () => void }) {
  const create = useCreateInvalidation(id);
  const form = useZodForm(invalidationSchema, { paths: DEFAULT_INVALIDATION_PATH });

  const submit = form.handleSubmit(({ paths }) =>
    create.mutate(
      paths,
      notifyOutcome({
        success: (invalidationId) => `Created invalidation ${invalidationId}`,
        errorHeader: "Couldn't create invalidation",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Create invalidation'
      actionText='Create invalidation'
      loading={create.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormTextarea
        control={form.control}
        name='paths'
        label='Paths'
        description='One path per line, like /index.html or /images/*.'
        rows={PATHS_ROWS}
        spellcheck={false}
      />
    </FormModal>
  );
}

export function InvalidationsTab({ id, compact }: { id: string; compact: boolean }) {
  const invalidations = useInvalidations(id);
  const [creating, setCreating] = useState(false);
  const { items, collectionProps } = useCollection<InvalidationSummary>(invalidations.data ?? [], {
    filtering: { empty: emptyOrError(invalidations, <EmptyState title='No invalidations' />) },
    // Mới nhất lên đầu
    sorting: {
      defaultState: { sortingColumn: { sortingField: CREATED_FIELD }, isDescending: true },
    },
  });

  const barActions: BarAction[] = [
    refreshAction(invalidations),
    { id: "create", text: "Create invalidation", primary: true, onClick: () => setCreating(true) },
  ];

  return (
    <SpaceBetween size='l'>
      <Alert type='info'>
        Floci doesn't cache, so files are always fresh; invalidations complete at once.
      </Alert>
      <Table
        {...collectionProps}
        items={items}
        trackBy='Id'
        loading={invalidations.isLoading}
        loadingText='Loading invalidations'
        wrapLines={compact}
        header={
          <Header
            counter={invalidations.data ? `(${invalidations.data.length})` : undefined}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Invalidations
          </Header>
        }
        columnDefinitions={[
          { id: "id", header: "Invalidation ID", isRowHeader: true, cell: (item) => item.Id },
          {
            id: "status",
            header: "Status",
            cell: (item) => (
              <StatusIndicator
                type={item.Status === INVALIDATION_COMPLETED ? "success" : "in-progress"}
              >
                {item.Status}
              </StatusIndicator>
            ),
          },
          {
            id: "created",
            header: "Created",
            sortingField: CREATED_FIELD,
            cell: (item) => formatDate(item.CreateTime),
          },
        ]}
      />
      {creating && <CreateInvalidationModal id={id} onDismiss={() => setCreating(false)} />}
    </SpaceBetween>
  );
}
