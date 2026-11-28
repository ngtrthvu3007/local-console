import type { LambdaService } from "#services/lambda/service.ts";
import type { SesService } from "#services/ses/service.ts";

// Lượt quét chung cho khối "Other senders" (queue / topic / function) và "Event senders" (bus).
// Floci chỉ có ít resource nên hỏi song song từng cái

export interface AsyncDestinations {
  name: string;
  onSuccess?: string;
  onFailure?: string;
}

export type AsyncScanLambda = Pick<LambdaService, "listFunctions" | "getAsyncInvocation">;
export type SetScanSes = Pick<SesService, "listConfigurationSets" | "listEventDestinations">;

// Đích async (On success / On failure) của mọi function
export async function listAsyncDestinations(lambda: AsyncScanLambda): Promise<AsyncDestinations[]> {
  const names = (await lambda.listFunctions()).flatMap((fn) => fn.FunctionName ?? []);

  return Promise.all(
    names.map(async (name) => {
      const destinations = (await lambda.getAsyncInvocation(name))?.DestinationConfig;
      return {
        name,
        onSuccess: destinations?.OnSuccess?.Destination,
        onFailure: destinations?.OnFailure?.Destination,
      };
    }),
  );
}

// Event destination của mọi configuration set
export async function listSetDestinations(ses: SetScanSes) {
  const names = await ses.listConfigurationSets();

  return Promise.all(
    names.map(async (name) => ({ name, destinations: await ses.listEventDestinations(name) })),
  );
}
