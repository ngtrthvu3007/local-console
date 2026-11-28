import {
  ListFunctionEventInvokeConfigsCommand,
  paginateListFunctions,
  type LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  GetConfigurationSetEventDestinationsCommand,
  paginateListConfigurationSets,
  type EventDestination,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";

// Hai lượt quét chung cho khối "Other senders" (queue / topic / function) và "Event senders" (bus).
// Floci chỉ có ít resource nên hỏi song song từng cái

interface AsyncDestinations {
  name: string;
  onSuccess?: string;
  onFailure?: string;
}

// Đích async (On success / On failure) của mọi function
export async function listAsyncDestinations(lambda: LambdaClient): Promise<AsyncDestinations[]> {
  const names: string[] = [];
  for await (const page of paginateListFunctions({ client: lambda }, {}))
    names.push(...(page.Functions ?? []).flatMap((fn) => fn.FunctionName ?? []));

  return Promise.all(
    names.map(async (name) => {
      const { FunctionEventInvokeConfigs = [] } = await lambda.send(
        new ListFunctionEventInvokeConfigsCommand({ FunctionName: name }),
      );

      const destinations = FunctionEventInvokeConfigs[0]?.DestinationConfig;

      return {
        name,
        onSuccess: destinations?.OnSuccess?.Destination,
        onFailure: destinations?.OnFailure?.Destination,
      };
    }),
  );
}

// Event destination của mọi configuration set
export async function listSetDestinations(
  ses: SESv2Client,
): Promise<{ name: string; destinations: EventDestination[] }[]> {
  const names: string[] = [];
  for await (const page of paginateListConfigurationSets({ client: ses }, {}))
    names.push(...(page.ConfigurationSets ?? []));

  return Promise.all(
    names.map(async (name) => ({
      name,
      destinations:
        (
          await ses.send(
            new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: name }),
          )
        ).EventDestinations ?? [],
    })),
  );
}
