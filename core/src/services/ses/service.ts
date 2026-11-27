import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { readEmail, type Email } from "./mailbox.ts";
import {
  addEventDestination,
  createConfigurationSet,
  deleteConfigurationSets,
  deleteEventDestination,
  listConfigurationSets,
  listEventDestinations,
  updateEventDestination,
  type DestinationChange,
} from "./operations/configurationSets.ts";
import {
  createIdentity,
  deleteIdentities,
  getIdentityConfigurationSet,
  listIdentities,
  setIdentityConfigurationSet,
} from "./operations/identities.ts";
import { deleteEmails, listEmails } from "./operations/mailbox.ts";
import { deleteTemplates, getTemplate, listTemplates } from "./operations/templates.ts";

export interface SesDeps {
  flociUrl: string;
  region: string;
}

export function createSesService(ses: SESv2Client, deps: SesDeps) {
  return {
    listEmails: () => listEmails(deps.flociUrl, deps.region),
    readEmail: (email: Email) => readEmail(email),
    deleteEmails: (ids: readonly string[]) => deleteEmails(deps.flociUrl, ids),
    listIdentities: () => listIdentities(ses),
    createIdentity: (email: string) => createIdentity(ses, email),
    deleteIdentities: (names: readonly string[]) => deleteIdentities(ses, names),
    getIdentityConfigurationSet: (name: string) => getIdentityConfigurationSet(ses, name),
    setIdentityConfigurationSet: (input: { identity: string; configurationSet?: string }) =>
      setIdentityConfigurationSet(ses, input),
    listTemplates: () => listTemplates(ses),
    getTemplate: (name: string) => getTemplate(ses, name),
    deleteTemplates: (names: readonly string[]) => deleteTemplates(ses, names),
    listConfigurationSets: () => listConfigurationSets(ses),
    listEventDestinations: (name: string) => listEventDestinations(ses, name),
    createConfigurationSet: (name: string) => createConfigurationSet(ses, name),
    deleteConfigurationSets: (names: readonly string[]) => deleteConfigurationSets(ses, names),
    addEventDestination: (change: DestinationChange) => addEventDestination(ses, change),
    updateEventDestination: (change: DestinationChange) => updateEventDestination(ses, change),
    deleteEventDestination: (set: string, name: string) => deleteEventDestination(ses, set, name),
  };
}

export type SesService = ReturnType<typeof createSesService>;
