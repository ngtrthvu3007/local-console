import { useState } from "react";
import type { DescribeSecretResponse } from "@aws-sdk/client-secrets-manager";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ActionBar } from "@shared/components/ActionBar.tsx";
import { NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { functionNameOfArn, FUNCTION_TABS, lambdaRoutes } from "@localconsole/core/lambda";
import { ROTATION_STARTED_MESSAGE, scheduleOf } from "@localconsole/core/secretsmanager";
import { useRotateNow } from "../hooks/useSecrets.ts";
import { EditRotationModal } from "./EditRotationModal.tsx";

// Log của Lambda là nơi duy nhất thấy rotation chạy ra sao (Floci chạy nền)
function LogsLink({ functionName, button }: { functionName: string; button?: boolean }) {
  const follow = useFollow();
  const href = lambdaRoutes.function(functionName, FUNCTION_TABS.monitor);

  return button ? (
    <Button href={href} onFollow={follow}>
      View Lambda logs
    </Button>
  ) : (
    <Link href={href} onFollow={follow}>
      {functionName}
    </Link>
  );
}

interface Props {
  name: string;
  secret: DescribeSecretResponse;
}

export function RotationSection({ name, secret }: Props) {
  const { ref, compact } = useIsCompact();
  const [editing, setEditing] = useState(false);
  const rotateNow = useRotateNow(name);
  const functionName = secret.RotationLambdaARN && functionNameOfArn(secret.RotationLambdaARN);
  const schedule = scheduleOf(secret.RotationRules);

  const rotate = () =>
    rotateNow.mutate(
      undefined,
      notifyOutcome({
        success: ROTATION_STARTED_MESSAGE,
        successAction: functionName && <LogsLink functionName={functionName} button />,
        errorHeader: `Couldn't rotate ${name}`,
      }),
    );

  const header = (
    <Header
      variant='h2'
      actions={
        <ActionBar
          compact={compact}
          actions={[
            { id: "edit", text: "Edit rotation", onClick: () => setEditing(true) },
            {
              id: "rotate",
              text: "Rotate secret immediately",
              disabled: !functionName,
              disabledReason: "Choose a rotation function first.",
              loading: rotateNow.isPending,
              onClick: rotate,
            },
          ]}
        />
      }
    >
      Rotation
    </Header>
  );

  return (
    <div ref={ref}>
      <Container header={header}>
        <KeyValuePairs
          columns={3}
          items={[
            {
              label: "Status",
              value: secret.RotationEnabled ? (
                <StatusIndicator>Enabled</StatusIndicator>
              ) : (
                <StatusIndicator type='stopped'>Disabled</StatusIndicator>
              ),
            },
            {
              label: "Rotation function",
              value: functionName ? <LogsLink functionName={functionName} /> : NOT_AVAILABLE,
            },
            { label: "Schedule", value: schedule ?? NOT_AVAILABLE },
            { label: "Last rotated", value: formatDate(secret.LastRotatedDate) },
            { label: "Next rotation", value: formatDate(secret.NextRotationDate) },
          ]}
        />
        {editing && (
          <EditRotationModal name={name} secret={secret} onDismiss={() => setEditing(false)} />
        )}
      </Container>
    </div>
  );
}
