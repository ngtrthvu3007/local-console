import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { NOT_AVAILABLE } from "@localconsole/core/shared";
import {
  AUTH_NONE,
  ROUTE_SELECTION_LABEL,
  type ApiType,
  type AuthorizerRow,
  type RouteRow,
  API_VERSIONS,
} from "@localconsole/core/apigateway";
import { useAuthorizers, useDeleteRoute, useRoutes } from "../hooks/useApiDetail.ts";
import { IntegrationValue } from "./IntegrationValue.tsx";
import { RouteModal } from "./RouteModal.tsx";

// Route không có authorizer: Floci trả NONE, spec hiện "—" như mọi giá trị thiếu
function authorizerOf(route: RouteRow, authorizers: AuthorizerRow[] = []) {
  if (route.authorizerId) {
    return authorizers.find((a) => a.id === route.authorizerId)?.name ?? route.authorizerId;
  }
  const hasNoAuth = !route.authorizationType || route.authorizationType === AUTH_NONE;
  if (hasNoAuth) return NOT_AVAILABLE;
  return route.authorizationType;
}

type Dialog = "create" | "edit" | "delete";

interface Props {
  apiId: string;
  apiType: ApiType;
  routeSelection?: string;
}

export function RoutesTab({ apiId, apiType, routeSelection }: Props) {
  const routes = useRoutes(apiId);
  const authorizers = useAuthorizers(API_VERSIONS.v2, apiId);
  const deleteRoute = useDeleteRoute(apiId);
  const [selected, setSelected] = useState<RouteRow[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Lấy lại từ dữ liệu mới: sửa route xong, dòng đã chọn vẫn là bản cũ (key cũ)
  const target = routes.data?.find((route) => route.id === selected[0]?.id);
  const close = () => setDialog(null);

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

  const confirmDelete = (route: RouteRow) =>
    deleteRoute.mutate(
      route.id,
      notifyOutcome({
        success: `Deleted route ${route.key}`,
        errorHeader: `Couldn't delete route ${route.key}`,
        then: () => {
          close();
          setSelected([]);
        },
      }),
    );

  return (
    <>
      <Table
        variant='container'
        trackBy='id'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<RouteRow>("route", (route) => route.key)}
        items={routes.data ?? []}
        loading={routes.isLoading}
        loadingText='Loading routes'
        columnDefinitions={columns}
        empty={emptyOrError(routes, <EmptyState title='No routes' />)}
        header={
          <Header
            counter={routes.data ? `(${routes.data.length})` : undefined}
            description={routeSelection ? ROUTE_SELECTION_LABEL + routeSelection : undefined}
            actions={
              <SpaceBetween size='xs' direction='horizontal'>
                <Button disabled={!target} onClick={() => setDialog("edit")}>
                  Edit
                </Button>
                <Button disabled={!target} onClick={() => setDialog("delete")}>
                  Delete
                </Button>
                <Button onClick={() => setDialog("create")}>Create route</Button>
              </SpaceBetween>
            }
          >
            Routes
          </Header>
        }
      />
      {(dialog === "create" || dialog === "edit") && (
        <RouteModal
          apiId={apiId}
          apiType={apiType}
          existingKeys={(routes.data ?? []).map((route) => route.key)}
          route={dialog === "edit" ? target : undefined}
          onDismiss={close}
        />
      )}
      {dialog === "delete" && target && (
        <ConfirmModal
          visible
          header={`Delete route ${target.key}?`}
          actionText='Delete'
          loading={deleteRoute.isPending}
          onConfirm={() => confirmDelete(target)}
          onDismiss={close}
        >
          Its integration is deleted too when no other route uses it.
        </ConfirmModal>
      )}
    </>
  );
}
