import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { useUserData } from "../hooks/useInstances.ts";

// Mô tả theo các điều đã đo trên Floci 2.4.0 (spec 7 #3, #4)
const USER_DATA_NOTE =
  "Floci runs user data about 40–80 seconds after the instance starts. Its output isn't available in the console. After Stop and Start, user data doesn't run again.";

export function UserDataTab({ instanceId }: { instanceId: string }) {
  const userData = useUserData(instanceId);

  return (
    <Container
      header={
        <Header variant='h2' description={USER_DATA_NOTE}>
          User data
        </Header>
      }
    >
      {userData.isError ? (
        <ErrorState error={userData.error} onRetry={() => userData.refetch()} />
      ) : userData.data === "" ? (
        <Box color='text-body-secondary'>No user data</Box>
      ) : (
        <CodeSnippet code={userData.data} wrap />
      )}
    </Container>
  );
}
