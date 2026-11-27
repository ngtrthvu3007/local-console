import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  DeleteConfigurationSetCommand,
  DeleteConfigurationSetEventDestinationCommand,
  GetConfigurationSetEventDestinationsCommand,
  paginateListConfigurationSets,
  UpdateConfigurationSetEventDestinationCommand,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import { toDefinition, type DestinationInput } from "#services/ses/configurationSets.ts";

export interface DestinationChange {
  set: string;
  name: string;
  input: DestinationInput;
}

export const listConfigurationSets = (ses: SESv2Client) =>
  collectPages(
    paginateListConfigurationSets({ client: ses }, {}),
    (page) => page.ConfigurationSets,
  );

export const listEventDestinations = async (ses: SESv2Client, name: string) =>
  (await ses.send(new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: name })))
    .EventDestinations ?? [];

export const createConfigurationSet = (ses: SESv2Client, name: string) =>
  ses.send(new CreateConfigurationSetCommand({ ConfigurationSetName: name }));

export const deleteConfigurationSets = (ses: SESv2Client, names: readonly string[]) =>
  runEach(
    names,
    (name) => name,
    (name) => ses.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: name })),
  );

const destinationParams = ({ set, name, input }: DestinationChange) => ({
  ConfigurationSetName: set,
  EventDestinationName: name,
  EventDestination: toDefinition(input),
});

export const addEventDestination = (ses: SESv2Client, change: DestinationChange) =>
  ses.send(new CreateConfigurationSetEventDestinationCommand(destinationParams(change)));

export const updateEventDestination = (ses: SESv2Client, change: DestinationChange) =>
  ses.send(new UpdateConfigurationSetEventDestinationCommand(destinationParams(change)));

export const deleteEventDestination = (ses: SESv2Client, set: string, name: string) =>
  ses.send(
    new DeleteConfigurationSetEventDestinationCommand({
      ConfigurationSetName: set,
      EventDestinationName: name,
    }),
  );
