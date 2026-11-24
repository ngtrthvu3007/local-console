import { useParams, useSearchParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { DetailsTab } from "../components/DetailsTab.tsx";
import { InstanceStatus } from "../components/InstanceStatus.tsx";
import { useInstanceStateActions } from "../components/InstanceStateActions.tsx";
import { UserDataTab } from "../components/UserDataTab.tsx";
import { useImages } from "../hooks/useImages.ts";
import { useInstance } from "../hooks/useInstances.ts";
import { instanceName } from "../instances.ts";
import {
  INSTANCE_TABS,
  SEARCH_PARAMS,
  ec2Routes,
  instanceCrumbs,
  type InstanceTab,
} from "../routes.ts";

const isInstanceTab = (value: string | null): value is InstanceTab =>
  Object.values<string | null>(INSTANCE_TABS).includes(value);

export function InstanceDetail() {
  const { instanceId: id = "" } = useParams();
  const { ref, compact } = useIsCompact();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isInstanceTab(requestedTab) ? requestedTab : INSTANCE_TABS.details;
  const details = useInstance(id);
  const images = useImages();
  const instance = details.data ?? undefined;
  const stateActions = useInstanceStateActions(instance);

  useBreadcrumbs(instanceCrumbs(id));

  const state = pageState(details, {
    ready: Boolean(instance),
    notFound: details.data === null,
    title: `Instance ${id} not found`,
    backHref: ec2Routes.instances,
    backText: "View instances",
  });
  if (state || !instance) return state;

  const image = images.data?.find((candidate) => candidate.ImageId === instance.ImageId);

  const tabs: TabsProps.Tab[] = [
    {
      id: INSTANCE_TABS.details,
      label: "Details",
      content: <DetailsTab instance={instance} image={image} />,
    },
    {
      id: INSTANCE_TABS.userData,
      label: "User data",
      content: <UserDataTab instanceId={id} />,
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <InstanceStatus instance={instance} />
          {DETAIL_SEPARATOR}
          {instance.InstanceType}
          <StackLink separated type='AWS::EC2::Instance' physicalId={id} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={[refreshAction(details)]}
          menuItems={stateActions.menuItems}
          onMenuItemClick={stateActions.onMenuItemClick}
        />
      }
    >
      {`${instanceName(instance)} (${id})`}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs
          activeTabId={tab}
          tabs={tabs}
          onChange={({ detail }) =>
            setSearchParams(
              detail.activeTabId === INSTANCE_TABS.details
                ? {}
                : { [SEARCH_PARAMS.tab]: detail.activeTabId },
            )
          }
        />
        {stateActions.modal}
      </ContentLayout>
    </div>
  );
}
