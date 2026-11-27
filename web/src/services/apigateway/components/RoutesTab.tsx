import Header from "@cloudscape-design/components/header";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { AUTH_NONE, ROUTE_SELECTION_LABEL } from "../constants.ts";
import { useAuthorizers, useRoutes, type AuthorizerRow } from "../hooks/useApiDetail.ts";
import type { RouteRow } from "../routeRows.ts";
import { API_VERSIONS } from "../routes.ts";
import { IntegrationValue } from "./IntegrationValue.tsx";

// Route không có authorizer: Floci trả NONE, spec hiện "—" như mọi giá trị thiếu
function authorizerOf(route: RouteRow, authorizers: AuthorizerRow[] = []) {
  if (route.authorizerId) {
    return authorizers.find((a) => a.id === route.authorizerId)?.name ?? route.authorizerId;
  }
  const hasNoAuth = !route.authorizationType || route.authorizationType === AUTH_NONE;
  if (hasNoAuth) return NOT_AVAILABLE;
  return route.authorizationType;
}

export function RoutesTab({ apiId, routeSelection }: { apiId: string; routeSelection?: string }) {
  const routes = useRoutes(apiId);
  const authorizers = useAuthorizers(API_VERSIONS.v2, apiId);

  const columns: TableProps.ColumnDefinition<RouteRow>[] = [
    { id: "route", header: "Route", isRowHeader: true, cell: (r) => r.key },
    {
      id: "integration",
      header: "Integration",
      cell: (r) => <IntegrationValue type={r.integrationType} uri={r.integrationUri} />,
    },
    {
      id: "authorizer",
      header: "Authorizer",
      cell: (r) => authorizerOf(r, authorizers.data),
    },
  ];

  return (
    <Table
      variant='container'
      trackBy='key'
      items={routes.data ?? []}
      loading={routes.isLoading}
      loadingText='Loading routes'
      columnDefinitions={columns}
      empty={emptyOrError(routes, <EmptyState title='No routes' />)}
      header={
        <Header
          counter={routes.data ? `(${routes.data.length})` : undefined}
          description={routeSelection ? ROUTE_SELECTION_LABEL + routeSelection : undefined}
        >
          Routes
        </Header>
      }
    />
  );
}
