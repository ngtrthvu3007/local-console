import { useState } from "react";
import type { UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import { FunctionLink } from "../../lambda/components/FunctionLink.tsx";
import { poolTriggerRows } from "@localconsole/core/cognito";
import { EditTriggersModal } from "./EditTriggersModal.tsx";

type TriggerRow = ReturnType<typeof poolTriggerRows>[number];

const CUSTOM_SENDER_HINT = "Editing custom senders isn't supported here.";
// Spec 7 #16
const FEDERATED_PRE_SIGN_UP_NOTE =
  "Floci 2.4.0 doesn't call Pre sign-up for a user's first federated sign-in.";

const COLUMNS: TableProps.ColumnDefinition<TriggerRow>[] = [
  {
    id: "trigger",
    header: "Trigger",
    isRowHeader: true,
    cell: (row) =>
      row.editable ? (
        row.label
      ) : (
        <div>
          {row.label}
          <Box variant='small' display='block' color='text-body-secondary'>
            {CUSTOM_SENDER_HINT}
          </Box>
        </div>
      ),
  },
  {
    id: "function",
    header: "Function",
    cell: (row) => (row.arn ? <FunctionLink arn={row.arn} /> : NOT_AVAILABLE),
  },
];

export function TriggersTab({ pool, poolId }: { pool: UserPoolType; poolId: string }) {
  const [editing, setEditing] = useState(false);

  return (
    <SpaceBetween size='l'>
      <Table
        trackBy='key'
        items={poolTriggerRows(pool.LambdaConfig)}
        columnDefinitions={COLUMNS}
        wrapLines
        header={
          <Header variant='h2' actions={<Button onClick={() => setEditing(true)}>Edit</Button>}>
            Lambda triggers
          </Header>
        }
      />
      <Alert type='info'>{FEDERATED_PRE_SIGN_UP_NOTE}</Alert>
      {editing && (
        <EditTriggersModal pool={pool} poolId={poolId} onDismiss={() => setEditing(false)} />
      )}
    </SpaceBetween>
  );
}
