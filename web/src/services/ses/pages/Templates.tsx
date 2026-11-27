import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import type { EmailTemplateMetadata } from "@aws-sdk/client-sesv2";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteTemplatesModal } from "../components/DeleteTemplatesModal.tsx";
import { TemplatePanel } from "../components/TemplatePanel.tsx";
import { useTemplate, useTemplates } from "../hooks/useTemplates.ts";
import { SEARCH_PARAMS, sesRoutes } from "@localconsole/core/ses";
import { sesBaseCrumbs } from "../routes.ts";

const NAME_FIELD = "TemplateName";
const crumbs = [...sesBaseCrumbs, { text: "Templates", href: sesRoutes.templates }];

export function Templates() {
  useBreadcrumbs(crumbs);
  const { region } = useLoadedConfig();
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
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    },
  );

  const selected = collectionProps.selectedItems ?? [];
  const templateHref = (name: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SEARCH_PARAMS.template, name);
    return `?${next}`;
  };
  const selectTemplate = (name: string) =>
    // Đổi template khi panel đang mở thì thay entry, để Back luôn đóng panel
    navigate(templateHref(name), { replace: Boolean(openName) });
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
    cell: ({ TemplateName: name }) =>
      name ? (
        <Link
          href={templateHref(name)}
          onFollow={(event) => {
            event.preventDefault();
            selectTemplate(name);
          }}
        >
          {/* Template đang mở in đậm: Table của Cloudscape không có kiểu dòng "đang mở" riêng */}
          {name === openName ? <strong>{name}</strong> : name}
        </Link>
      ) : (
        NOT_AVAILABLE
      ),
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
      description={`Templates your app sends emails with. Region: ${region}.`}
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
