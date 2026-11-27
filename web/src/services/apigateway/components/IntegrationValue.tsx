import Link from "@cloudscape-design/components/link";
import { BreakableText } from "@shared/components/BreakableText.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { lambdaRoutes } from "../../lambda/routes.ts";
import { INTEGRATION_ARROW } from "../constants.ts";
import { describeIntegration, integrationLabel, lambdaLabel } from "../integration.ts";

// Lambda có tên thật thì link sang function; URI dài xuống dòng, không cuộn ngang
export function IntegrationValue({ type, uri }: { type?: string; uri?: string }) {
  const follow = useFollow();
  const view = describeIntegration(type, uri);
  if (view.kind === "lambda" && view.functionName) {
    return (
      <>
        {lambdaLabel(view.proxy) + INTEGRATION_ARROW}
        <Link href={lambdaRoutes.function(view.functionName)} onFollow={follow}>
          {view.functionName}
        </Link>
      </>
    );
  }
  return <BreakableText text={integrationLabel(view, uri)} />;
}
