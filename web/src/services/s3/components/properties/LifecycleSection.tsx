import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { TableProps } from "@cloudscape-design/components/table";
import type { LifecycleRule } from "@aws-sdk/client-s3";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { LIFECYCLE_STATUS } from "../../constants.ts";
import { useLifecycleRules, useSaveLifecycleRules } from "../../hooks/useBucketSettings.ts";
import { describeLifecycleActions, lifecycleScope, toLifecycleRule } from "../../lifecycleRules.ts";
import { LifecycleModal } from "./LifecycleModal.tsx";
import { RulesSection } from "./RulesSection.tsx";

const ruleId = (rule: LifecycleRule) => rule.ID ?? NOT_AVAILABLE;

function ActionsCell({ rule }: { rule: LifecycleRule }) {
  const actions = describeLifecycleActions(rule);
  if (!actions.length) return NOT_AVAILABLE;
  return (
    <SpaceBetween size='xxxs'>
      {actions.map((action) => (
        <Box key={action}>{action}</Box>
      ))}
    </SpaceBetween>
  );
}

const COLUMNS: TableProps.ColumnDefinition<LifecycleRule>[] = [
  { id: "name", header: "Name", isRowHeader: true, cell: ruleId },
  {
    id: "status",
    header: "Status",
    cell: (rule) => (
      <StatusIndicator type={rule.Status === LIFECYCLE_STATUS.enabled ? "success" : "stopped"}>
        {rule.Status}
      </StatusIndicator>
    ),
  },
  { id: "scope", header: "Scope", cell: lifecycleScope },
  { id: "actions", header: "Actions", cell: (rule) => <ActionsCell rule={rule} /> },
];

const DESCRIPTION =
  "Expire objects, clean up old versions and abort unfinished uploads automatically.";

export function LifecycleSection({ bucket }: { bucket: string }) {
  const lifecycle = useLifecycleRules(bucket);
  const saveRules = useSaveLifecycleRules(bucket);
  return (
    <RulesSection
      title='Lifecycle rules'
      description={DESCRIPTION}
      createText='Create lifecycle rule'
      empty={{ title: "No lifecycle rules" }}
      rules={lifecycle.data ?? []}
      query={lifecycle}
      ruleId={ruleId}
      columns={COLUMNS}
      saving={saveRules.isPending}
      save={(rules, success, then) =>
        saveRules.mutate(
          rules,
          notifyOutcome({ success, errorHeader: "Couldn't save lifecycle rules", then }),
        )
      }
      createModal={({ existingIds, onCreate, onDismiss }) => (
        <LifecycleModal
          existingIds={existingIds}
          saving={saveRules.isPending}
          onDismiss={onDismiss}
          onSave={(values) =>
            onCreate(toLifecycleRule(values), `Created lifecycle rule ${values.id}`)
          }
        />
      )}
    />
  );
}
