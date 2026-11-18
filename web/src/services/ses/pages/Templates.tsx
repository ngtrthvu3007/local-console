import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import type { EmailTemplateMetadata } from "@aws-sdk/client-sesv2";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteTemplatesModal } from "../components/DeleteTemplatesModal.tsx";
import { TemplatePanel } from "../components/TemplatePanel.tsx";
import { useTemplate, useTemplates } from "../hooks/useTemplates.ts";
import { SEARCH_PARAMS, sesBaseCrumbs, sesRoutes } from "../routes.ts";

const NAME_FIELD = "TemplateName";
const PAGE_SIZE = 50;
const crumbs = [...sesBaseCrumbs, { text: "Templates", href: sesRoutes.templates }];

export function Templates() {
  useBreadcrumbs(crumbs);
  const { ref, compact } = useIsCompact();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const templates = useTemplates();
  // Giữ chính các template cần xóa, không giữ cờ, để modal không kẹt khi panel đóng
  const [deleting, setDeleting] = useState<readonly EmailTemplateMetadata[] | null>(null);
  // Tên trên URL không còn trong danh sách thì không có template để mở, panel đóng
  const openParam = searchParams.get(SEARCH_PARAMS.template);
  const openName = templates.data?.find(
    (template) => template.TemplateName === openParam,
  )?.TemplateName;
  const openContent = useTemplate(openName);

  const emptyState = emptyOrError(
    templates,
    <EmptyState
      title='No templates yet'
      description='Templates your app or CDK creates show up here.'
    />,
  );

  const { items, collectionProps, paginationProps, actions } = useCollection<EmailTemplateMetadata>(
    templates.data ?? [],
    {
      filtering: { empty: emptyState },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    },
  );

  const selected = collectionProps.selectedItems ?? [];
  const selectTemplate = (template: EmailTemplateMetadata) => {
    if (!template.TemplateName) return;
    const next = new URLSearchParams(searchParams);
    next.set(SEARCH_PARAMS.template, template.TemplateName);
    // Đổi template khi panel đang mở thì thay entry, để Back luôn đóng panel
    navigate(`?${next}`, { replace: Boolean(openName) });
  };
  const closeTemplate = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(SEARCH_PARAMS.template);
        return next;
      },
      { replace: true },
    );
  const finishDelete = (names: string[]) => {
    setDeleting(null);
    actions.setSelectedItems([]);
    if (openName && names.includes(openName)) closeTemplate();
  };

  // Mô tả của SplitPanel nằm trong <p> nên chỉ dùng chữ
  useSplitPanel(
    openName
      ? {
          header: openName,
          description: openContent.data?.Subject ?? NOT_AVAILABLE,
          onClose: closeTemplate,
          body: <TemplatePanel key={openName} name={openName} />,
        }
      : null,
  );

  const nameColumn: TableProps.ColumnDefinition<EmailTemplateMetadata> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: (template) => template.TemplateName ?? NOT_AVAILABLE,
  };
  const createdColumn: TableProps.ColumnDefinition<EmailTemplateMetadata> = {
    id: "created",
    header: "Created",
    cell: (template) => formatDate(template.CreatedTimestamp),
  };

  const barActions: BarAction[] = [
    refreshAction(templates),
    {
      id: "delete",
      text: "Delete",
      disabled: !selected.length,
      onClick: () => setDeleting(selected),
    },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={templates.data ? `(${templates.data.length})` : undefined}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Templates
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<EmailTemplateMetadata>(
          "template",
          (item) => item.TemplateName ?? "",
        )}
        trackBy={NAME_FIELD}
        items={items}
        loading={templates.isLoading}
        loadingText='Loading templates'
        columnDefinitions={[nameColumn, createdColumn]}
        wrapLines={compact}
        onRowClick={({ detail }) => selectTemplate(detail.item)}
        header={header}
        pagination={<Pagination {...paginationProps} />}
      />
      {deleting && (
        <DeleteTemplatesModal
          templates={deleting}
          onDismiss={() => setDeleting(null)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
