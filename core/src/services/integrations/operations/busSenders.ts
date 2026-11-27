import { DETAIL_SEPARATOR } from "#shared/constants.ts";
import { lambdaRoutes } from "#services/lambda/paths.ts";
import { sesRoutes } from "#services/ses/paths.ts";
import { listAsyncDestinations, listSetDestinations } from "./scans.ts";
import type { Sender, SenderServices } from "./senders.ts";

// Ai đang gửi event vào một bus: Lambda (đích async) và configuration set của SES
export async function listBusSenders(
  { lambda, ses }: Pick<SenderServices, "lambda" | "ses">,
  busArn: string,
): Promise<Sender[]> {
  const [functions, sets] = await Promise.all([
    listAsyncDestinations(lambda),
    listSetDestinations(ses),
  ]);
  const fromFunctions = functions.flatMap(({ name, onSuccess, onFailure }) => {
    const outcomes = [
      ...(onSuccess === busArn ? ["success"] : []),
      ...(onFailure === busArn ? ["failure"] : []),
    ];
    return outcomes.length
      ? [
          {
            id: `lambda:${name}`,
            type: "Lambda function",
            name,
            detail: outcomes.map((outcome) => `Async ${outcome}`).join(DETAIL_SEPARATOR),
            href: lambdaRoutes.function(name),
          },
        ]
      : [];
  });
  const fromSets = sets
    .filter(({ destinations }) =>
      destinations.some(
        (destination) => destination.EventBridgeDestination?.EventBusArn === busArn,
      ),
    )
    .map(({ name }) => ({
      id: `ses:${name}`,
      type: "SES configuration set",
      name,
      detail: "Mail events",
      href: sesRoutes.configurationSetPage(name),
    }));
  return [...fromFunctions.sort((a, b) => a.name.localeCompare(b.name)), ...fromSets];
}
