import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TreeView from "@cloudscape-design/components/tree-view";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useResources } from "../hooks/useApiDetail.ts";
import {
  ALL_METHODS_REASON,
  GREEDY_LEAF_REASON,
  HAS_CHILDREN_REASON,
  METHOD_ORDER,
  ROOT_RESOURCE_REASON,
  pathParamsOf,
  resourceTree,
  type ResourceNode,
} from "@localconsole/core/apigateway";
import { MethodModal } from "./MethodModal.tsx";
import { MethodOverview } from "./MethodOverview.tsx";
import { CreateResourceModal, DeleteMethodModal, DeleteResourceModal } from "./ResourceModals.tsx";

interface TreeItem {
  id: string;
  label: string;
  path: string;
  isMethod: boolean;
  children: TreeItem[];
}

type Dialog = "createResource" | "deleteResource" | "createMethod" | "editMethod" | "deleteMethod";

const allIds = (items: TreeItem[]): string[] =>
  items.flatMap((item) => [item.id, ...allIds(item.children)]);

const allNodes = (nodes: ResourceNode[]): ResourceNode[] =>
  nodes.flatMap((node) => [node, ...allNodes(node.children)]);

const methodItemId = (resourceId: string, method: string) => `${resourceId}:${method}`;

const toItem = (node: ResourceNode): TreeItem => ({
  id: node.id,
  label: node.path,
  path: node.path,
  isMethod: false,
  children: [
    ...node.methods.map((m) => ({
      id: methodItemId(node.id, m),
      label: m,
      path: node.path,
      isMethod: true,
      children: [],
    })),
    ...node.children.map(toItem),
  ],
});

const deleteResourceReason = (node: ResourceNode, isRoot: boolean) => {
  if (isRoot) return ROOT_RESOURCE_REASON;
  return node.children.length ? HAS_CHILDREN_REASON : undefined;
};

export function ResourcesTab({ apiId }: { apiId: string }) {
  const resources = useResources(apiId);
  const { ref, compact } = useIsCompact();
  // Resource / method chọn giữ trong state trang, không lên URL
  const [selected, setSelected] = useState<string | null>(null);
  // Lưu node bị thu gọn để mặc định mọi resource mở sẵn khi dữ liệu về
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const roots = resourceTree(resources.data ?? []);
  const items = roots.map(toItem);
  const selection = resources.data
    ?.flatMap((r) =>
      Object.values(r.resourceMethods ?? {}).map((m) => ({
        id: r.id ?? "",
        path: r.path ?? "",
        m,
      })),
    )
    .find(({ id, m }) => methodItemId(id, m.httpMethod ?? "") === selected);
  // Resource đang làm việc: của method đang chọn, resource đang chọn, hoặc gốc
  const nodes = allNodes(roots);
  const resource = nodes.find((node) => node.id === (selection?.id ?? selected)) ?? roots[0];

  // emptyOrError không có nhánh loading, tránh hiện "No resources" giả khi đang tải
  if (resources.isLoading)
    return (
      <Container>
        <StatusIndicator type='loading'>Loading resources</StatusIndicator>
      </Container>
    );
  // Lỗi / rỗng dùng chung helper với các tab khác
  if (resources.isError || !resource)
    return <Container>{emptyOrError(resources, <EmptyState title='No resources' />)}</Container>;

  const greedy = pathParamsOf(resource.pathPart).some((param) => param.greedy);
  const freeMethods = METHOD_ORDER.filter((name) => !resource.methods.includes(name));
  const deleteReason = deleteResourceReason(resource, resource === roots[0]);
  const close = () => setDialog(null);

  const treeActions = (
    <SpaceBetween size='xs' direction='horizontal'>
      <Button
        disabled={greedy}
        disabledReason={greedy ? GREEDY_LEAF_REASON : undefined}
        onClick={() => setDialog("createResource")}
      >
        Create resource
      </Button>
      <Button
        disabled={!freeMethods.length}
        disabledReason={freeMethods.length ? undefined : ALL_METHODS_REASON}
        onClick={() => setDialog("createMethod")}
      >
        Create method
      </Button>
    </SpaceBetween>
  );

  const detailActions = selection ? (
    <SpaceBetween size='xs' direction='horizontal'>
      <Button onClick={() => setDialog("editMethod")}>Edit</Button>
      <Button onClick={() => setDialog("deleteMethod")}>Delete</Button>
    </SpaceBetween>
  ) : (
    <Button
      disabled={Boolean(deleteReason)}
      disabledReason={deleteReason}
      onClick={() => setDialog("deleteResource")}
    >
      Delete
    </Button>
  );

  return (
    <div ref={ref}>
      <ColumnLayout columns={compact ? 1 : 2}>
        <Container header={<Header actions={treeActions}>Resources</Header>}>
          <TreeView
            items={items}
            getItemId={(item) => item.id}
            expandedItems={allIds(items).filter((id) => !collapsed.includes(id))}
            onItemToggle={({ detail }) =>
              setCollapsed((prev) =>
                detail.expanded
                  ? prev.filter((id) => id !== detail.item.id)
                  : [...prev, detail.item.id],
              )
            }
            getItemChildren={(item) => item.children}
            renderItem={(item) => ({
              content: (
                <Button
                  variant={item.id === selected ? "normal" : "inline-link"}
                  ariaLabel={item.isMethod ? `${item.label} ${item.path}` : item.path}
                  onClick={() => setSelected(item.id)}
                >
                  {item.label}
                </Button>
              ),
            })}
            ariaLabel='Resources'
            i18nStrings={{
              collapseButtonLabel: () => "Collapse",
              expandButtonLabel: () => "Expand",
            }}
          />
        </Container>
        <Container
          header={
            <Header variant='h2' actions={detailActions}>
              {selection ? `${selection.m.httpMethod} ${selection.path}` : resource.path}
            </Header>
          }
        >
          {selection ? (
            <MethodOverview method={selection.m} path={selection.path} apiId={apiId} />
          ) : (
            <Box color='text-body-secondary'>Select a method to see its details.</Box>
          )}
        </Container>
      </ColumnLayout>
      {dialog === "createResource" && (
        <CreateResourceModal
          apiId={apiId}
          parent={resource}
          onDismiss={close}
          onCreated={(id) => {
            close();
            setSelected(id);
          }}
        />
      )}
      {dialog === "deleteResource" && (
        <DeleteResourceModal
          apiId={apiId}
          resource={resource}
          onDismiss={close}
          onDone={() => {
            close();
            setSelected(null);
          }}
        />
      )}
      {(dialog === "createMethod" || dialog === "editMethod") && (
        <MethodModal
          apiId={apiId}
          resource={resource}
          existingMethods={resource.methods}
          method={dialog === "editMethod" ? selection?.m : undefined}
          onDismiss={close}
        />
      )}
      {dialog === "deleteMethod" && selection && (
        <DeleteMethodModal
          apiId={apiId}
          resource={resource}
          httpMethod={selection.m.httpMethod ?? ""}
          onDismiss={close}
          onDone={() => {
            close();
            setSelected(resource.id);
          }}
        />
      )}
    </div>
  );
}
