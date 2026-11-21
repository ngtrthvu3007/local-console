import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { reformatJson } from "@shared/json.ts";
import { ruleSample } from "../codeSamples.ts";
import { RULE_TYPES } from "../constants.ts";
import { ruleType, type Rule } from "../rules.ts";
import { eventbridgeRoutes } from "../routes.ts";

const DETAILS_COLUMNS = 3;

export function RuleDetailsTab({ rule }: { rule: Rule }) {
  const follow = useFollow();
  // Điện thoại: khối có ARN dài để một cột, giống SNS
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);

  const items: KeyValuePairsProps.Item[] = [
    { label: "Type", value: RULE_TYPES[ruleType(rule)] },
    { label: "State", value: rule.enabled ? "Enabled" : "Disabled" },
    {
      label: "Event bus",
      value: (
        <Link href={eventbridgeRoutes.rules(rule.bus)} onFollow={follow}>
          {rule.bus}
        </Link>
      ),
    },
    { label: "Description", value: rule.description ?? NOT_AVAILABLE },
    { label: "ARN", value: <CopyButton variant='inline' text={rule.arn} label={rule.arn} /> },
    ...(rule.scheduleExpression
      ? [{ label: "Schedule expression", value: rule.scheduleExpression }]
      : []),
  ];

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>General</Header>}>
          <KeyValuePairs columns={compact ? 1 : DETAILS_COLUMNS} items={items} />
        </Container>
        {rule.eventPattern && (
          <Container header={<Header variant='h2'>Event pattern</Header>}>
            <CodeSnippet code={reformatJson(rule.eventPattern)} />
          </Container>
        )}
        <ConnectCard sample={ruleSample(rule)} />
      </SpaceBetween>
    </div>
  );
}
