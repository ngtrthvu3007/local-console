import { useSearchParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { AliasesTab } from "../components/AliasesTab.tsx";
import { DetailsTab } from "../components/DetailsTab.tsx";
import { useKeyActions } from "../components/KeyActions.tsx";
import { KeyStatus } from "../components/KeyStatus.tsx";
import { PolicyTab } from "../components/PolicyTab.tsx";
import { TryItTab } from "../components/TryItTab.tsx";
import { KEY_MANAGERS } from "../constants.ts";
import { useKey } from "../hooks/useKeys.ts";
import { keyTypeLabel, keyUsageLabel } from "../keys.ts";
import { KEY_TABS, SEARCH_PARAMS, keyCrumbs, kmsRoutes, type KeyTab } from "../routes.ts";

const isKeyTab = (value: string | null): value is KeyTab =>
  Object.values<string | null>(KEY_TABS).includes(value);

export function KeyDetail() {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = searchParams.get(SEARCH_PARAMS.key) ?? "";
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isKeyTab(requestedTab) ? requestedTab : KEY_TABS.details;
  const { ref, compact } = useIsCompact();
  const details = useKey(key);
  const row = details.data ?? undefined;
  const keyActions = useKeyActions(row);

  useBreadcrumbs(keyCrumbs(key));

  const state = pageState(details, {
    ready: Boolean(row),
    notFound: details.data === null,
    title: `Key ${key} not found`,
    backHref: kmsRoutes.keys,
    backText: "View keys",
  });
  if (state || !row) return state;

  const { meta } = row;
  const keyId = meta.KeyId ?? "";
  const customer = meta.KeyManager === KEY_MANAGERS.customer;

  const tabs: TabsProps.Tab[] = [
    {
      id: KEY_TABS.details,
      label: "Details",
      content: <DetailsTab row={row} compact={compact} />,
    },
    { id: KEY_TABS.aliases, label: "Aliases", content: <AliasesTab row={row} /> },
    { id: KEY_TABS.policy, label: "Key policy", content: <PolicyTab keyId={keyId} /> },
    { id: KEY_TABS.tryIt, label: "Try it", content: <TryItTab meta={meta} /> },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <KeyStatus meta={meta} />
          {DETAIL_SEPARATOR}
          {keyTypeLabel(meta)}
          {DETAIL_SEPARATOR}
          {keyUsageLabel(meta.KeyUsage)}
          <StackLink separated type='AWS::KMS::Key' physicalId={keyId} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={[refreshAction(details)]}
          menuItems={customer ? keyActions.menuItems : undefined}
          onMenuItemClick={customer ? keyActions.onMenuItemClick : undefined}
        />
      }
    >
      {row.aliases[0] ? `${row.aliases[0]} (${keyId})` : keyId}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs
          activeTabId={tab}
          tabs={tabs}
          onChange={({ detail }) =>
            setSearchParams({
              [SEARCH_PARAMS.key]: key,
              ...(detail.activeTabId === KEY_TABS.details
                ? {}
                : { [SEARCH_PARAMS.tab]: detail.activeTabId }),
            })
          }
        />
        {keyActions.modal}
      </ContentLayout>
    </div>
  );
}
