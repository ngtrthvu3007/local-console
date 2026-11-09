import { useEffect } from "react";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import type { Exchange } from "@server/routes/rabbitmq/contract.ts";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, ITEM_LIST_WIDTH_PX } from "@shared/constants.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { isUnauthorized, useExchanges } from "../hooks/useRabbit.ts";
import { exchangeLabel } from "./QueueModals.tsx";

const durableText = (exchange: Exchange) => (exchange.durable ? "Durable" : "Transient");

interface Props {
  broker: string;
  authorization: string;
  onUnauthorized: () => void;
}

// Chỉ xem: exchange thường do BE khai báo khi khởi động
export function ExchangesTab({ broker, authorization, onUnauthorized }: Props) {
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const exchanges = useExchanges(broker, authorization);

  const unauthorized = isUnauthorized(exchanges.error);
  useEffect(() => {
    if (unauthorized) onUnauthorized();
  }, [unauthorized, onUnauthorized]);

  const columns: TableProps.ColumnDefinition<Exchange>[] = compact
    ? [
        {
          id: "name",
          header: "Name",
          isRowHeader: true,
          cell: (exchange) => (
            <div>
              {exchangeLabel(exchange.name)}
              <Box variant='small' display='block' color='text-body-secondary'>
                {[exchange.type, durableText(exchange)].join(DETAIL_SEPARATOR)}
              </Box>
            </div>
          ),
        },
      ]
    : [
        {
          id: "name",
          header: "Name",
          isRowHeader: true,
          cell: (exchange) => exchangeLabel(exchange.name),
        },
        { id: "type", header: "Type", cell: (exchange) => exchange.type },
        { id: "durable", header: "Durability", cell: durableText },
      ];

  return (
    <div ref={ref}>
      <Table
        variant='container'
        items={exchanges.data ?? []}
        trackBy='name'
        loading={exchanges.isLoading}
        loadingText='Loading exchanges'
        columnDefinitions={columns}
        wrapLines={compact}
        empty={emptyOrError(exchanges, <EmptyState title='No exchanges' />)}
        header={
          <Header
            counter={exchanges.data ? `(${exchanges.data.length})` : undefined}
            actions={<ActionBar compact={false} actions={[refreshAction(exchanges)]} />}
          >
            Exchanges
          </Header>
        }
      />
    </div>
  );
}
