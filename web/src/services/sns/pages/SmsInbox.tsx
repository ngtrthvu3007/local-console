import { useState } from "react";
import { useSearchParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Toggle from "@cloudscape-design/components/toggle";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { ClearSmsModal } from "../components/ClearSmsModal.tsx";
import { PublishSmsModal } from "../components/PublishSmsModal.tsx";
import { useSmsInbox } from "../hooks/useSms.ts";
import { SEARCH_PARAMS, smsCrumbs } from "../routes.ts";
import { formatPhoneNumber, matchesSearch, sentAt, type Sms } from "../smsInbox.ts";

const ID_FIELD = "Id";
const PHONE_NUMBER_STYLE = { whiteSpace: "nowrap" } as const;

function PhoneNumber({ phoneNumber }: { phoneNumber: string }) {
  return <span style={PHONE_NUMBER_STYLE}>{formatPhoneNumber(phoneNumber)}</span>;
}
// SMS ngắn, hiện đủ nội dung và giữ xuống dòng
const MESSAGE_STYLE = { whiteSpace: "pre-wrap" } as const;

function MessageText({ sms }: { sms: Sms }) {
  return (
    <div style={MESSAGE_STYLE}>
      {sms.Subject && (
        <Box variant='small' display='block' color='text-body-secondary'>
          {sms.Subject}
        </Box>
      )}
      {sms.Message}
    </div>
  );
}

export function SmsInbox() {
  useBreadcrumbs(smsCrumbs);
  const { region } = useLoadedConfig();
  const { ref, compact } = useIsCompact();
  const [searchParams] = useSearchParams();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const inbox = useSmsInbox(autoRefresh);
  const [clearing, setClearing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<Sms>(inbox.data ?? [], {
      filtering: {
        defaultFilteringText: searchParams.get(SEARCH_PARAMS.phone) ?? "",
        empty: emptyOrError(
          inbox,
          <EmptyState
            title='No text messages yet'
            description='SMS your app sends through SNS shows up here.'
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        filteringFunction: matchesSearch,
      },
      pagination: { pageSize: TABLE_PAGE_SIZE },
    });

  const messages = inbox.data ?? [];

  const columns: TableProps.ColumnDefinition<Sms>[] = [
    {
      id: "phone",
      header: "Phone number",
      isRowHeader: true,
      cell: (sms) => <PhoneNumber phoneNumber={sms.PhoneNumber} />,
    },
    { id: "message", header: "Message", cell: (sms) => <MessageText sms={sms} /> },
    { id: "sent", header: "Sent", cell: (sms) => formatDate(sentAt(sms)) },
  ];
  // Khung hẹp: nội dung ở trên, số điện thoại và giờ gửi ở dòng xám dưới
  const compactColumns: TableProps.ColumnDefinition<Sms>[] = [
    {
      id: "message",
      header: "Message",
      isRowHeader: true,
      cell: (sms) => (
        <div>
          <MessageText sms={sms} />
          <Box variant='small' display='block' color='text-body-secondary'>
            <PhoneNumber phoneNumber={sms.PhoneNumber} />
            {DETAIL_SEPARATOR}
            {formatDate(sentAt(sms))}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(inbox),
    // Chỉ có "xóa hết": Floci không xóa được từng tin
    {
      id: "deleteAll",
      text: "Delete all",
      disabled: !messages.length,
      onClick: () => setClearing(true),
    },
    {
      id: "publish",
      text: "Publish text message",
      primary: true,
      onClick: () => setPublishing(true),
    },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={inbox.data ? `(${messages.length})` : undefined}
      description={`SMS your app sent through SNS in ${region}. Nothing is delivered. SMS sent to topic subscriptions isn't captured by Floci.`}
      actions={
        <SpaceBetween direction='horizontal' size='l' alignItems='center'>
          <Toggle checked={autoRefresh} onChange={({ detail }) => setAutoRefresh(detail.checked)}>
            Auto refresh
          </Toggle>
          <ActionBar compact={compact} actions={barActions} />
        </SpaceBetween>
      }
    >
      Text messages
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        trackBy={ID_FIELD}
        items={items}
        loading={inbox.isLoading}
        loadingText='Loading text messages'
        columnDefinitions={compact ? compactColumns : columns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find by phone number or message'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {publishing && <PublishSmsModal onDismiss={() => setPublishing(false)} />}
      {clearing && <ClearSmsModal count={messages.length} onDismiss={() => setClearing(false)} />}
    </div>
  );
}
