import type { TableProps } from "@cloudscape-design/components/table";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { NOTIFICATION_DESTINATIONS } from "../../constants.ts";
import {
  useBucketNotifications,
  useSaveBucketNotifications,
} from "../../hooks/useBucketSettings.ts";
import {
  toNotificationConfiguration,
  toNotificationRules,
  type NotificationRule,
} from "../../notificationRules.ts";
import { NotificationModal } from "./NotificationModal.tsx";
import { RulesSection } from "./RulesSection.tsx";

const FILTER_SEPARATOR = " … ";

const ruleId = (rule: NotificationRule) => rule.id || rule.arn;

const COLUMNS: TableProps.ColumnDefinition<NotificationRule>[] = [
  { id: "name", header: "Name", isRowHeader: true, cell: (rule) => rule.id || NOT_AVAILABLE },
  { id: "events", header: "Event types", cell: (rule) => rule.events.join(", ") },
  {
    id: "filter",
    header: "Filters",
    cell: (rule) =>
      [rule.prefix, rule.suffix].filter(Boolean).join(FILTER_SEPARATOR) || NOT_AVAILABLE,
  },
  {
    id: "destinationType",
    header: "Destination type",
    cell: (rule) => NOTIFICATION_DESTINATIONS[rule.destination].label,
  },
  { id: "destination", header: "Destination", cell: (rule) => rule.arn },
];

const DESCRIPTION =
  "Trigger a Lambda function, an SQS queue or an SNS topic when objects are created or removed.";

export function NotificationsSection({ bucket }: { bucket: string }) {
  const notifications = useBucketNotifications(bucket);
  const saveNotifications = useSaveBucketNotifications(bucket);
  return (
    <RulesSection
      title='Event notifications'
      description={DESCRIPTION}
      createText='Create event notification'
      empty={{
        title: "No event notifications",
        description: "Send an event to Lambda, SQS or SNS when objects change.",
      }}
      rules={toNotificationRules(notifications.data)}
      query={notifications}
      ruleId={ruleId}
      columns={COLUMNS}
      saving={saveNotifications.isPending}
      save={(rules, success, then) =>
        saveNotifications.mutate(
          toNotificationConfiguration(rules),
          notifyOutcome({ success, errorHeader: "Couldn't save event notifications", then }),
        )
      }
      createModal={({ existingIds, onCreate, onDismiss }) => (
        <NotificationModal
          existingIds={existingIds}
          saving={saveNotifications.isPending}
          onDismiss={onDismiss}
          onSave={(rule) => onCreate(rule, "Created event notification")}
        />
      )}
    />
  );
}
