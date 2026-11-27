import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { pageState } from "@shared/components/PageState.tsx";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { copyToClipboard } from "@shared/clipboard.ts";
import { DETAIL_SEPARATOR } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { DeleteRulesModal } from "../components/DeleteRulesModal.tsx";
import { RuleDetailsTab } from "../components/RuleDetailsTab.tsx";
import { TargetsTab } from "../components/TargetsTab.tsx";
import {
  RULE_TYPES,
  ruleType,
  type Rule,
  RULE_TABS,
  eventbridgeRoutes,
} from "@localconsole/core/eventbridge";
import { useRule, useSetRulesEnabled } from "../hooks/useRules.ts";
import { useTargets } from "../hooks/useTargets.ts";
import { ruleCrumbs } from "../routes.ts";

function RuleView({ rule }: { rule: Rule }) {
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(RULE_TABS, RULE_TABS.targets);
  const [deleting, setDeleting] = useState(false);
  const targets = useTargets(rule.bus, rule.name);
  const setEnabled = useSetRulesEnabled();

  const toggleState = () =>
    setEnabled.mutate(
      { rules: [rule], enabled: !rule.enabled },
      notifyOutcome({
        success: rule.enabled ? "Disabled rule" : "Enabled rule",
        errorHeader: "Couldn't change the rule state",
      }),
    );

  const tabs: TabsProps.Tab[] = [
    {
      id: RULE_TABS.targets,
      label: "Targets",
      content: <TargetsTab bus={rule.bus} rule={rule.name} />,
    },
    { id: RULE_TABS.details, label: "Details", content: <RuleDetailsTab rule={rule} /> },
  ];

  const barActions: BarAction[] = [
    { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
    {
      id: "state",
      text: rule.enabled ? "Disable" : "Enable",
      loading: setEnabled.isPending,
      onClick: toggleState,
    },
    {
      id: "edit",
      text: "Edit",
      primary: true,
      href: eventbridgeRoutes.editRule(rule.bus, rule.name),
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {[
            RULE_TYPES[ruleType(rule)],
            rule.enabled ? "Enabled" : "Disabled",
            `bus ${rule.bus}`,
          ].join(DETAIL_SEPARATOR)}
          <StackLink separated type='AWS::Events::Rule' physicalId={rule.name} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={[{ id: "copy", text: "Copy ARN" }]}
          onMenuItemClick={() => copyToClipboard(rule.arn, "ARN")}
        />
      }
    >
      {rule.name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
      </ContentLayout>
      {deleting && (
        <DeleteRulesModal
          rules={[{ ...rule, targets: targets.data?.length ?? 0 }]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(eventbridgeRoutes.rules(rule.bus))}
        />
      )}
    </div>
  );
}

export function RuleDetail() {
  const { bus = "", rule: ruleName = "" } = useParams();
  const details = useRule(bus, ruleName);

  useBreadcrumbs(ruleCrumbs(bus, ruleName));

  const state = pageState(details, {
    ready: Boolean(details.data),
    title: `Rule ${ruleName} not found`,
    backHref: eventbridgeRoutes.rules(bus),
    backText: "View rules",
  });
  if (state || !details.data) return state;

  return <RuleView rule={details.data} />;
}
