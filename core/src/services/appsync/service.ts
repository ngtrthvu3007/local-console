import type { AppSyncClient, UpdateGraphqlApiRequest } from "@aws-sdk/client-appsync";
import type { CreateApiForm } from "./schemas.ts";
import { createApiKey, deleteApiKey, listApiKeys, type NewApiKey } from "./operations/apiKeys.ts";
import {
  deleteDataSource,
  listDataSources,
  saveDataSource,
  type SaveDataSourceInput,
} from "./operations/dataSources.ts";
import {
  deleteFunction,
  listFunctions,
  saveFunction,
  type SaveFunctionInput,
} from "./operations/functions.ts";
import { createApi, deleteApi, getApi, listApis, updateApi } from "./operations/graphqlApis.ts";
import {
  deleteResolver,
  listResolvers,
  saveResolver,
  type ResolverField,
  type SaveResolverInput,
} from "./operations/resolvers.ts";
import { getSchema, saveSchema } from "./operations/schema.ts";

interface AppSyncDeps {
  region: string;
}

export function createAppSyncService(appsync: AppSyncClient, { region }: AppSyncDeps) {
  return {
    listApis: () => listApis(appsync),
    getApi: (apiId: string) => getApi(appsync, apiId),
    createApi: (form: CreateApiForm) => createApi(appsync, region, form),
    updateApi: (update: UpdateGraphqlApiRequest) => updateApi(appsync, update),
    deleteApi: (apiId: string) => deleteApi(appsync, apiId),

    getSchema: (apiId: string) => getSchema(appsync, apiId),
    saveSchema: (apiId: string, sdl: string) => saveSchema(appsync, apiId, sdl),

    listApiKeys: (apiId: string) => listApiKeys(appsync, apiId),
    createApiKey: (apiId: string, key: NewApiKey) => createApiKey(appsync, apiId, key),
    deleteApiKey: (apiId: string, id: string) => deleteApiKey(appsync, apiId, id),

    listDataSources: (apiId: string) => listDataSources(appsync, apiId),
    saveDataSource: (apiId: string, input: SaveDataSourceInput) =>
      saveDataSource(appsync, region, apiId, input),
    deleteDataSource: (apiId: string, name: string) => deleteDataSource(appsync, apiId, name),

    listFunctions: (apiId: string) => listFunctions(appsync, apiId),
    saveFunction: (apiId: string, input: SaveFunctionInput) => saveFunction(appsync, apiId, input),
    deleteFunction: (apiId: string, functionId: string) =>
      deleteFunction(appsync, apiId, functionId),

    listResolvers: (apiId: string, typeNames: readonly string[]) =>
      listResolvers(appsync, apiId, typeNames),
    saveResolver: (apiId: string, input: SaveResolverInput) => saveResolver(appsync, apiId, input),
    deleteResolver: (apiId: string, field: ResolverField) => deleteResolver(appsync, apiId, field),
  };
}
