import {
  CreateResolverCommand,
  DeleteResolverCommand,
  UpdateResolverCommand,
  paginateListResolvers,
  type AppSyncClient,
} from "@aws-sdk/client-appsync";
import { collectPages } from "#shared/aws/pagination.ts";
import { resolverInput } from "#services/appsync/apis.ts";
import type { ResolverForm } from "#services/appsync/schemas.ts";

export interface ResolverField {
  typeName: string;
  fieldName: string;
}

export interface SaveResolverInput extends ResolverField {
  exists: boolean;
  form: ResolverForm;
}

// ListResolvers chỉ theo từng type: gọi cho mọi type của schema, song song
export async function listResolvers(
  appsync: AppSyncClient,
  apiId: string,
  typeNames: readonly string[],
) {
  const perType = await Promise.all(
    typeNames.map((typeName) =>
      collectPages(
        paginateListResolvers({ client: appsync }, { apiId, typeName }),
        (page) => page.resolvers,
      ),
    ),
  );
  return perType.flat();
}

export const deleteResolver = (
  appsync: AppSyncClient,
  apiId: string,
  { typeName, fieldName }: ResolverField,
) => appsync.send(new DeleteResolverCommand({ apiId, typeName, fieldName }));

export function saveResolver(
  appsync: AppSyncClient,
  apiId: string,
  { typeName, fieldName, exists, form }: SaveResolverInput,
) {
  const input = { apiId, ...resolverInput(form, typeName, fieldName) };
  return appsync.send(exists ? new UpdateResolverCommand(input) : new CreateResolverCommand(input));
}
