import { INTEGRATION_TARGET_PREFIX } from "./constants.ts";

export interface RouteRow {
  key: string;
  authorizationType: string;
  authorizerId?: string;
  integrationType?: string;
  integrationUri?: string;
}

interface RouteInput {
  RouteKey?: string;
  Target?: string;
  AuthorizationType?: string;
  AuthorizerId?: string;
}
interface IntegrationInput {
  IntegrationId?: string;
  IntegrationType?: string;
  IntegrationUri?: string;
}

// Ghép route với integration qua Target = integrations/<id>
export function joinRoutes(routes: RouteInput[], integrations: IntegrationInput[]): RouteRow[] {
  const byId = new Map(integrations.map((i) => [i.IntegrationId, i]));
  return routes.map((r) => {
    const id = r.Target?.startsWith(INTEGRATION_TARGET_PREFIX)
      ? r.Target.slice(INTEGRATION_TARGET_PREFIX.length)
      : undefined;
    const integration = byId.get(id);
    return {
      key: r.RouteKey ?? "",
      authorizationType: r.AuthorizationType ?? "",
      authorizerId: r.AuthorizerId,
      integrationType: integration?.IntegrationType,
      integrationUri: integration?.IntegrationUri,
    };
  });
}
