import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { TableProps } from "@cloudscape-design/components/table";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { NOTIFICATION_DESTINATIONS } from "../../constants.ts";
import {
  useBucketNotifications,
  useSaveBucketNotifications,
} from "../../hooks/useBucketSettings.ts";
import { useMissingDestinations } from "../../hooks/useMissingDestinations.ts";
import {
  toNotificationConfiguration,
  toNotificationRules,
  type NotificationRule,
} from "../../notificationRules.ts";
import { FunctionLink } from "../../../lambda/components/FunctionLink.tsx";
import { QueueLink } from "../../../sqs/components/QueueLink.tsx";
import { queueNameOfArn } from "../../../sqs/queues.ts";
import { TopicLink } from "../../../sns/components/TopicLink.tsx";
import { topicNameOfArn } from "../../../sns/topics.ts";
import { NotificationModal } from "./NotificationModal.tsx";
import { RulesSection } from "./RulesSection.tsx";

const FILTER_SEPARATOR = " … ";
const SAVE_ERROR_HEADER = "Couldn't save event notifications";

const ruleId = (rule: NotificationRule) => rule.id || rule.arn;

// Đích có trang trên console thì là link
function DestinationCell({ rule }: { rule: NotificationRule }) {
  if (rule.destination === "sqs") return <QueueLink name={queueNameOfArn(rule.arn)} />;
  if (rule.destination === "lambda") return <FunctionLink arn={rule.arn} />;
  if (rule.destination === "sns") return <TopicLink name={topicNameOfArn(rule.arn)} />;
  return <>{rule.arn}</>;
}

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
  {
    id: "destination",
    header: "Destination",
    cell: (rule) => <DestinationCell rule={rule} />,
  },
];

const DESCRIPTION =
  "Trigger a Lambda function, an SQS queue or an SNS topic when objects are created or removed.";

export function NotificationsSection({ bucket }: { bucket: string }) {
  const notifications = useBucketNotifications(bucket);
  const saveNotifications = useSaveBucketNotifications(bucket);
  const rules = toNotificationRules(notifications.data);
  const missing = useMissingDestinations(rules);

  const save = (next: NotificationRule[], success: string, then?: () => void) =>
    saveNotifications.mutate(
      toNotificationConfiguration(next, notifications.data),
      notifyOutcome({ success, errorHeader: SAVE_ERROR_HEADER, then }),
    );

  return (
    <SpaceBetween size='l'>
      {missing.length > 0 && (
        <Alert
          type='warning'
          header='Some destinations no longer exist'
          action={
            <Button
              loading={saveNotifications.isPending}
              onClick={() =>
                save(
                  rules.filter((rule) => !missing.includes(rule)),
                  `Removed ${pluralize(missing.length, "broken event notification")}`,
                )
              }
            >
              Remove broken rules
            </Button>
          }
        >
          S3 rejects every change to these notifications while a rule points at a deleted function,
          queue or topic.
        </Alert>
      )}
      <RulesSection
        title='Event notifications'
        description={DESCRIPTION}
        createText='Create event notification'
        empty={{
          title: "No event notifications",
          description: "Send an event to Lambda, SQS or SNS when objects change.",
        }}
        rules={rules}
        query={notifications}
        ruleId={ruleId}
        columns={COLUMNS}
        saving={saveNotifications.isPending}
        save={save}
        createModal={({ existingIds, onCreate, onDismiss }) => (
          <NotificationModal
            existingIds={existingIds}
            existingRules={rules}
            saving={saveNotifications.isPending}
            onDismiss={onDismiss}
            onSave={(rule) => onCreate(rule, "Created event notification")}
          />
        )}
      />
    </SpaceBetween>
  );
}
