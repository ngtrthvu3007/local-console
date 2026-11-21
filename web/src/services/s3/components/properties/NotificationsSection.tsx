import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Toggle from "@cloudscape-design/components/toggle";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { TableProps } from "@cloudscape-design/components/table";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
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
import { useS3EventRules } from "../../../eventbridge/hooks/useRules.ts";
import { eventbridgeRoutes } from "../../../eventbridge/routes.ts";
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

const EVENTBRIDGE_DESCRIPTION =
  "Send every event of this bucket to Amazon EventBridge, where rules match them by source aws.s3.";

export function NotificationsSection({ bucket }: { bucket: string }) {
  const follow = useFollow();
  const notifications = useBucketNotifications(bucket);
  const saveNotifications = useSaveBucketNotifications(bucket);
  const rules = toNotificationRules(notifications.data);
  const missing = useMissingDestinations(rules);

  const save = (next: NotificationRule[], success: string, then?: () => void) =>
    saveNotifications.mutate(
      toNotificationConfiguration(next, notifications.data),
      notifyOutcome({ success, errorHeader: SAVE_ERROR_HEADER, then }),
    );

  const eventBridgeOn = Boolean(notifications.data?.EventBridgeConfiguration);
  const s3Rules = useS3EventRules(bucket, eventBridgeOn).data ?? [];
  const [confirmingOff, setConfirmingOff] = useState(false);
  const toggleEventBridge = (enabled: boolean) =>
    saveNotifications.mutate(
      toNotificationConfiguration(rules, notifications.data, enabled),
      notifyOutcome({
        success: `${enabled ? "Turned on" : "Turned off"} Amazon EventBridge for this bucket`,
        errorHeader: SAVE_ERROR_HEADER,
      }),
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
      <Container
        header={
          <Header variant='h2' description={EVENTBRIDGE_DESCRIPTION}>
            Amazon EventBridge
          </Header>
        }
      >
        <SpaceBetween size='xs'>
          <Toggle
            checked={eventBridgeOn}
            disabled={!notifications.data || saveNotifications.isPending}
            // Tắt khi còn rule bắt event của bucket thì rule im lặng ngừng nhận: hỏi lại trước
            onChange={({ detail }) =>
              !detail.checked && s3Rules.length
                ? setConfirmingOff(true)
                : toggleEventBridge(detail.checked)
            }
          >
            {eventBridgeOn ? "On" : "Off"}
          </Toggle>
          <Link href={eventbridgeRoutes.createRule()} onFollow={follow}>
            Create a rule to match these events
          </Link>
        </SpaceBetween>
      </Container>
      <ConfirmModal
        visible={confirmingOff}
        header='Turn off Amazon EventBridge?'
        actionText='Turn off'
        loading={saveNotifications.isPending}
        onDismiss={() => setConfirmingOff(false)}
        onConfirm={() => {
          toggleEventBridge(false);
          setConfirmingOff(false);
        }}
      >
        <Box>
          {pluralize(s3Rules.length, "rule")} match events from this bucket and stop receiving them:
        </Box>
        <DeletePreview lines={s3Rules.map((rule) => `${rule.name} (bus ${rule.bus})`)} />
      </ConfirmModal>
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
