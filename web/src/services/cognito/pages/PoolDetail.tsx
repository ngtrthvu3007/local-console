import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import type { UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { StackLink } from "@shared/StackLink.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DeletePoolsModal } from "../components/DeletePoolsModal.tsx";
import { ClientsTab } from "../components/ClientsTab.tsx";
import { GroupsTab } from "../components/GroupsTab.tsx";
import { ProvidersTab } from "../components/ProvidersTab.tsx";
import { UsersTab } from "../components/UsersTab.tsx";
import { DetailsTab } from "../components/DetailsTab.tsx";
import { TriggersTab } from "../components/TriggersTab.tsx";
import { TestSignInModal } from "../components/TestSignInModal.tsx";
import {
  EMAIL_ATTRIBUTE,
  SIGN_IN_WITH,
  isCognitoMissing,
  POOL_TABS,
  cognitoRoutes,
  type PoolTab,
} from "@localconsole/core/cognito";
import { useUserPool } from "../hooks/usePools.ts";
import { poolCrumbs } from "../routes.ts";

const TAB_LABELS: Record<PoolTab, string> = {
  users: "Users",
  groups: "Groups",
  clients: "App clients",
  providers: "Identity providers",
  triggers: "Triggers",
  details: "Details",
};

const SIGN_IN_LABELS = {
  [SIGN_IN_WITH.email]: "Sign-in with email",
  [SIGN_IN_WITH.username]: "Sign-in with username",
};

function PoolView({ pool, poolId }: { pool: UserPoolType; poolId: string }) {
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(POOL_TABS, POOL_TABS.users);
  const [deleting, setDeleting] = useState(false);
  const [testingSignIn, setTestingSignIn] = useState(false);

  const content: Record<PoolTab, ReactNode> = {
    [POOL_TABS.users]: <UsersTab pool={pool} poolId={poolId} />,
    [POOL_TABS.groups]: <GroupsTab poolId={poolId} />,
    [POOL_TABS.clients]: <ClientsTab poolId={poolId} />,
    [POOL_TABS.providers]: <ProvidersTab pool={pool} poolId={poolId} />,
    [POOL_TABS.triggers]: <TriggersTab pool={pool} poolId={poolId} />,
    [POOL_TABS.details]: <DetailsTab pool={pool} />,
  };

  const signIn = pool.UsernameAttributes?.includes(EMAIL_ATTRIBUTE)
    ? SIGN_IN_WITH.email
    : SIGN_IN_WITH.username;

  return (
    <div ref={ref}>
      <ContentLayout
        header={
          <Header
            variant='h1'
            description={
              <>
                {[poolId, SIGN_IN_LABELS[signIn]].join(DETAIL_SEPARATOR)}
                <StackLink separated type='AWS::Cognito::UserPool' physicalId={poolId} />
              </>
            }
            actions={
              <ActionBar
                compact={compact}
                actions={[
                  { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
                  {
                    id: "test-sign-in",
                    text: "Test sign-in",
                    primary: true,
                    onClick: () => setTestingSignIn(true),
                  },
                ]}
              />
            }
          >
            {pool.Name ?? NOT_AVAILABLE}
          </Header>
        }
      >
        <Tabs
          activeTabId={tab}
          tabs={Object.values(POOL_TABS).map((id) => ({
            id,
            label: TAB_LABELS[id],
            content: content[id],
          }))}
          onChange={({ detail }) => setTab(detail.activeTabId)}
        />
      </ContentLayout>
      {deleting && (
        <DeletePoolsModal
          pools={[pool]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(cognitoRoutes.pools)}
        />
      )}
      {testingSignIn && (
        <TestSignInModal poolId={poolId} onDismiss={() => setTestingSignIn(false)} />
      )}
    </div>
  );
}

export function PoolDetail() {
  const { poolId = "" } = useParams();
  const details = useUserPool(poolId);

  useBreadcrumbs(poolCrumbs(poolId, details.data?.Name ?? poolId));

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isCognitoMissing(details.error),
    title: `User pool ${poolId} not found`,
    backHref: cognitoRoutes.pools,
    backText: "View user pools",
  });

  if (state || !details.data) return state;

  return <PoolView pool={details.data} poolId={poolId} />;
}
