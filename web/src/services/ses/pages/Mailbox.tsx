import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TextFilter from "@cloudscape-design/components/text-filter";
import Toggle from "@cloudscape-design/components/toggle";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DeleteEmailsModal } from "../components/DeleteEmailsModal.tsx";
import { EmailPanel } from "../components/EmailPanel.tsx";
import {
  ADDRESS_SEPARATOR,
  NO_SUBJECT,
  matchesSearch,
  recipientsOf,
  sentAt,
  type Email,
  SEARCH_PARAMS,
  sesRoutes,
} from "@localconsole/core/ses";
import { useEmailContent, useMailbox, useMimeFields } from "../hooks/useMailbox.ts";
import { sesBaseCrumbs } from "../routes.ts";

const ID_FIELD = "Id";
const ATTACHMENT_ICON = "📎";
type DeleteTarget = { emails: readonly Email[]; all: boolean };

const crumbs = [...sesBaseCrumbs, { text: "Mailbox", href: sesRoutes.mailbox }];

function Recipients({ email }: { email: Email }) {
  const [first, ...others] = recipientsOf(email);
  if (!first) return <>{NOT_AVAILABLE}</>;

  return (
    <>
      {first}
      {others.length > 0 && (
        <Box color='text-body-secondary' display='inline'>
          {" "}
          +{others.length}
        </Box>
      )}
    </>
  );
}

function SubjectCell({ email }: { email: Email }) {
  if (email.RejectReason) {
    return <StatusIndicator type='error'>Rejected: {email.RejectReason}</StatusIndicator>;
  }

  return (
    <>
      {email.Attachments?.length ? `${ATTACHMENT_ICON} ` : ""}
      {email.Subject || NO_SUBJECT}
    </>
  );
}

export function Mailbox() {
  useBreadcrumbs(crumbs);
  const { region } = useLoadedConfig();
  const { ref, compact } = useIsCompact();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const mailbox = useMailbox(autoRefresh);
  const emails = useMimeFields(mailbox.data);
  // Giữ bản sao các mail cần xóa, không giữ cờ: Auto refresh hay đóng mail khi modal mở thì modal vẫn đúng danh sách người dùng đã thấy
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  // Id trên URL không còn trong danh sách (đã xóa) thì không có mail để mở, panel đóng
  const openId = searchParams.get(SEARCH_PARAMS.email);
  const openEmail = emails?.find((email) => email.Id === openId);
  const openContent = useEmailContent(openEmail);

  const emptyState = emptyOrError(
    mailbox,
    <EmptyState
      title='No emails yet'
      description='Emails your app sends through SES show up here.'
    />,
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Email>(emails ?? [], {
      filtering: {
        defaultFilteringText: searchParams.get(SEARCH_PARAMS.search) ?? "",
        empty: emptyState,
        noMatch: (
          <EmptyState
            title='No matches'
            action={
              <Button
                onClick={() => {
                  actions.setFiltering("");
                  deleteParam(SEARCH_PARAMS.search);
                }}
              >
                Clear filter
              </Button>
            }
          />
        ),
        filteringFunction: matchesSearch,
      },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];

  const emailHref = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SEARCH_PARAMS.email, id);
    return `?${next}`;
  };

  const selectEmail = (email: Email) =>
    // Đổi mail khi panel đang mở thì thay entry, để Back luôn đóng panel
    navigate(emailHref(email.Id), { replace: Boolean(openId) });

  const deleteParam = (name: string) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(name);
        return next;
      },
      { replace: true },
    );

  const closeEmail = () => deleteParam(SEARCH_PARAMS.email);

  const finishDelete = (deleted: readonly Email[]) => {
    setDeleteTarget(null);
    actions.setSelectedItems([]);
    if (deleted.some((email) => email.Id === openId)) closeEmail();
  };

  const panelHeader = (email: Email) =>
    email.RejectReason ? "Rejected email" : openContent.data?.subject || NO_SUBJECT;

  // Mô tả của SplitPanel nằm trong <p> nên chỉ dùng chữ, không dùng KeyValuePairs (div)
  const panelDescription = (email: Email) =>
    [
      `From ${email.Source ?? NOT_AVAILABLE}`,
      `Sent ${formatDate(sentAt(email))}`,
      `To ${openContent.data?.to.join(ADDRESS_SEPARATOR) || NOT_AVAILABLE}`,
    ].join(DETAIL_SEPARATOR);

  useSplitPanel(
    openEmail
      ? {
          header: panelHeader(openEmail),
          description: panelDescription(openEmail),
          onClose: closeEmail,
          body: (
            <SpaceBetween size='m'>
              <ResponsiveActions>
                <Button onClick={() => setDeleteTarget({ emails: [openEmail], all: false })}>
                  Delete
                </Button>
              </ResponsiveActions>
              <EmailPanel key={openEmail.Id} email={openEmail} />
            </SpaceBetween>
          ),
        }
      : null,
  );

  const subjectLink = (email: Email) => (
    <Link
      href={emailHref(email.Id)}
      onFollow={(event) => {
        event.preventDefault();
        selectEmail(email);
      }}
    >
      {/* Mail đang mở in đậm: Table của Cloudscape không có kiểu dòng "đang mở" riêng */}
      {email.Id === openId ? (
        <strong>
          <SubjectCell email={email} />
        </strong>
      ) : (
        <SubjectCell email={email} />
      )}
    </Link>
  );

  const toColumn: TableProps.ColumnDefinition<Email> = {
    id: "to",
    header: "To",
    cell: (email) => <Recipients email={email} />,
  };

  const subjectColumn: TableProps.ColumnDefinition<Email> = {
    id: "subject",
    header: "Subject",
    isRowHeader: true,
    cell: subjectLink,
  };

  const fromColumn: TableProps.ColumnDefinition<Email> = {
    id: "from",
    header: "From",
    cell: (email) => email.Source ?? NOT_AVAILABLE,
  };

  const sentColumn: TableProps.ColumnDefinition<Email> = {
    id: "sent",
    header: "Sent",
    cell: (email) => formatDate(sentAt(email)),
  };

  // Khung hẹp: tầng 1 chỉ có subject (link mở mail); tầng 2 xám: người nhận và giờ gửi
  const compactColumns: TableProps.ColumnDefinition<Email>[] = [
    {
      ...subjectColumn,
      cell: (email) => (
        <div>
          {subjectLink(email)}
          <Box variant='small' display='block' color='text-body-secondary'>
            <Recipients email={email} />
            {DETAIL_SEPARATOR}
            {formatDate(sentAt(email))}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(mailbox),
    {
      id: "delete",
      text: "Delete",
      disabled: !selected.length,
      onClick: () => setDeleteTarget({ emails: selected, all: false }),
    },
    {
      id: "deleteAll",
      text: "Delete all",
      disabled: !emails?.length,
      onClick: () => setDeleteTarget({ emails: emails ?? [], all: true }),
    },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={emails ? `(${emails.length})` : undefined}
      description={`Emails your app sent through SES in ${region}. Nothing is delivered.`}
      actions={
        <SpaceBetween direction='horizontal' size='l' alignItems='center'>
          <Toggle checked={autoRefresh} onChange={({ detail }) => setAutoRefresh(detail.checked)}>
            Auto refresh
          </Toggle>
          <ActionBar compact={compact} actions={barActions} />
        </SpaceBetween>
      }
    >
      Mailbox
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<Email>("email", (item) => item.Subject || item.Id)}
        trackBy={ID_FIELD}
        items={items}
        loading={mailbox.isLoading}
        loadingText='Loading emails'
        columnDefinitions={
          compact ? compactColumns : [toColumn, subjectColumn, fromColumn, sentColumn]
        }
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find by recipient, sender or subject'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {deleteTarget && (
        <DeleteEmailsModal
          emails={deleteTarget.emails}
          all={deleteTarget.all}
          onDismiss={() => setDeleteTarget(null)}
          onDeleted={() => finishDelete(deleteTarget.emails)}
        />
      )}
    </div>
  );
}
