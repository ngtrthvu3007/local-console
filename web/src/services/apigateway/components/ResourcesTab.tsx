import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TreeView from "@cloudscape-design/components/tree-view";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useResources } from "../hooks/useApiDetail.ts";
import { resourceTree, type ResourceNode } from "../resources.ts";
import { MethodOverview } from "./MethodOverview.tsx";

interface TreeItem {
  id: string;
  label: string;
  path: string;
  isMethod: boolean;
  children: TreeItem[];
}

const allIds = (items: TreeItem[]): string[] =>
  items.flatMap((item) => [item.id, ...allIds(item.children)]);

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

export function ResourcesTab({ apiId }: { apiId: string }) {
  const resources = useResources(apiId);
  const { ref, compact } = useIsCompact();
  // Method chọn giữ trong state trang, không lên URL
  const [selected, setSelected] = useState<string | null>(null);
  // Lưu node bị thu gọn để mặc định mọi resource mở sẵn khi dữ liệu về
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const items = resourceTree(resources.data ?? []).map(toItem);
  const selection = resources.data
    ?.flatMap((r) =>
      Object.values(r.resourceMethods ?? {}).map((m) => ({
        id: r.id ?? "",
        path: r.path ?? "",
        m,
      })),
    )
    .find(({ id, m }) => methodItemId(id, m.httpMethod ?? "") === selected);

  // emptyOrError không có nhánh loading, tránh hiện "No resources" giả khi đang tải
  if (resources.isLoading)
    return (
      <Container>
        <StatusIndicator type='loading'>Loading resources</StatusIndicator>
      </Container>
    );
  // Lỗi / rỗng dùng chung helper với các tab khác
  if (resources.isError || !items.length)
    return <Container>{emptyOrError(resources, <EmptyState title='No resources' />)}</Container>;

  return (
    <div ref={ref}>
      <ColumnLayout columns={compact ? 1 : 2}>
        <Container header={<Header variant='h2'>Resources</Header>}>
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
              content: item.isMethod ? (
                <Button
                  variant={item.id === selected ? "normal" : "inline-link"}
                  ariaLabel={`${item.label} ${item.path}`}
                  onClick={() => setSelected(item.id)}
                >
                  {item.label}
                </Button>
              ) : (
                item.label
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
            <Header variant='h2'>
              {selection ? `${selection.m.httpMethod} ${selection.path}` : "Method"}
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
    </div>
  );
}
