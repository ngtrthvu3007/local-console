import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { useDistributionActions } from "../components/DistributionActions.tsx";
import { DistributionStatus } from "../components/DistributionStatus.tsx";
import { BehaviorsTab } from "../components/BehaviorsTab.tsx";
import { GeneralTab } from "../components/GeneralTab.tsx";
import { InvalidationsTab } from "../components/InvalidationsTab.tsx";
import { OriginsTab } from "../components/OriginsTab.tsx";
import { useDistribution } from "../hooks/useDistributions.ts";
import { DISTRIBUTION_TABS, cloudfrontRoutes } from "@localconsole/core/cloudfront";
import { distributionCrumbs } from "../routes.ts";

export function DistributionDetail() {
  const { distributionId: id = "" } = useParams();
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(DISTRIBUTION_TABS, DISTRIBUTION_TABS.general);
  const details = useDistribution(id);
  const distribution = details.data ?? undefined;
  const config = distribution?.DistributionConfig;
  const actions = useDistributionActions(
    distribution && { id, enabled: Boolean(config?.Enabled) },
    () => navigate(cloudfrontRoutes.distributions),
  );

  useBreadcrumbs(distributionCrumbs(id));

  const state = pageState(details, {
    ready: Boolean(distribution),
    notFound: details.data === null,
    title: `Distribution ${id} not found`,
    backHref: cloudfrontRoutes.distributions,
    backText: "View distributions",
  });
  if (state || !distribution) return state;

  const tabs: TabsProps.Tab[] = [
    {
      id: DISTRIBUTION_TABS.general,
      label: "General",
      content: <GeneralTab distribution={distribution} compact={compact} />,
    },
    {
      id: DISTRIBUTION_TABS.origins,
      label: "Origins",
      content: <OriginsTab distribution={distribution} compact={compact} />,
    },
    {
      id: DISTRIBUTION_TABS.behaviors,
      label: "Behaviors",
      content: <BehaviorsTab distribution={distribution} compact={compact} />,
    },
    {
      id: DISTRIBUTION_TABS.invalidations,
      label: "Invalidations",
      content: <InvalidationsTab id={id} compact={compact} />,
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <DistributionStatus enabled={config?.Enabled} />
          {config?.Comment ? `${DETAIL_SEPARATOR}${config.Comment}` : null}
          <StackLink separated type='AWS::CloudFront::Distribution' physicalId={id} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={[refreshAction(details)]}
          menuItems={actions.menuItems}
          onMenuItemClick={actions.onMenuItemClick}
        />
      }
    >
      {id}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
        {actions.modal}
      </ContentLayout>
    </div>
  );
}
