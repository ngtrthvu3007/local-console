import { INTEGRATION_TARGET_PREFIX } from "./constants.ts";

export interface RouteRow {
  id: string;
  key: string;
  authorizationType: string;
  authorizerId?: string;
  integrationId?: string;
  integrationType?: string;
  integrationUri?: string;
  // WebSocket: trả kết quả function cho client (two-way)
  twoWay: boolean;
}

interface RouteInput {
  RouteId?: string;
  RouteKey?: string;
  Target?: string;
  AuthorizationType?: string;
  AuthorizerId?: string;
  RouteResponseSelectionExpression?: string;
}
interface IntegrationInput {
  IntegrationId?: string;
  IntegrationType?: string;
  IntegrationUri?: string;
}

// Target = integrations/<id>
export const integrationIdOf = (target?: string) =>
  target?.startsWith(INTEGRATION_TARGET_PREFIX)
    ? target.slice(INTEGRATION_TARGET_PREFIX.length)
    : undefined;

export const integrationTarget = (integrationId: string) =>
  `${INTEGRATION_TARGET_PREFIX}${integrationId}`;

export function joinRoutes(routes: RouteInput[], integrations: IntegrationInput[]): RouteRow[] {
  const byId = new Map(integrations.map((i) => [i.IntegrationId, i]));
  return routes.map((r) => {
    const integrationId = integrationIdOf(r.Target);
    const integration = byId.get(integrationId);
    return {
      id: r.RouteId ?? "",
      key: r.RouteKey ?? "",
      authorizationType: r.AuthorizationType ?? "",
      authorizerId: r.AuthorizerId,
      integrationId,
      integrationType: integration?.IntegrationType,
      integrationUri: integration?.IntegrationUri,
      twoWay: Boolean(r.RouteResponseSelectionExpression),
    };
  });
}
