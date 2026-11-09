import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Grid, { type GridProps } from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFlociStatus } from "@shared/hooks/useFlociStatus.ts";
import { ConnectYourApp } from "./ConnectYourApp.tsx";
import { FlociCard } from "./FlociCard.tsx";
import { ServicesTable } from "./ServicesTable.tsx";

const FULL_WIDTH = 12;
const MAIN_COLUMN = 8;
const SIDE_COLUMN = 4;

// Breakpoint của Grid tính theo bề ngang vùng nội dung (~1110px ở màn 1440), nên dùng "s"
const TWO_COLUMNS: GridProps.ElementDefinition[] = [
  { colspan: { default: FULL_WIDTH, s: MAIN_COLUMN } },
  { colspan: { default: FULL_WIDTH, s: SIDE_COLUMN } },
];

export function Home() {
  const floci = useFlociStatus();
  const config = useLoadedConfig();

  const sublines = {
    checking: "Checking Floci…",
    down: `Floci isn't responding at ${floci.endpoint} · checked ${floci.checkedAt}`,
    running: `Floci ${floci.version ?? ""} at ${config.flociPublicUrl} · checked ${floci.checkedAt}`,
  };

  const refreshButton = <Button iconName='refresh' ariaLabel='Refresh' onClick={floci.refresh} />;

  const header = (
    <Header variant='h1' description={sublines[floci.state]} actions={refreshButton}>
      Console Home
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <SpaceBetween size='l'>
        <ServicesTable />
        <Grid gridDefinition={TWO_COLUMNS}>
          <ConnectYourApp />
          <FlociCard />
        </Grid>
      </SpaceBetween>
    </ContentLayout>
  );
}
