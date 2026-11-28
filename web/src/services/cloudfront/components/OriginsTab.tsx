import { useState } from "react";
import type { Distribution, Origin } from "@aws-sdk/client-cloudfront";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { usedByText } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { BucketLink } from "../../s3/components/BucketLink.tsx";
import { ORIGIN_TYPES, type OriginProtocol } from "../constants.ts";
import {
  behaviorsUsing,
  bucketOfOriginDomain,
  originTypeOf,
  originsOf,
  portOf,
  protocolOf,
  withoutOrigin,
} from "../distributions.ts";
import { useUpdateDistribution } from "../hooks/useDistributions.ts";
import { OriginModal } from "./OriginModal.tsx";

const MENU = { edit: "edit", delete: "delete" } as const;

const SCHEMES: Record<OriginProtocol, string> = { "http-only": "http", "https-only": "https" };

// <protocol>://<domain>:<port> của custom origin
function customAddress(origin: Origin) {
  const protocol = protocolOf(origin);
  return `${SCHEMES[protocol]}://${origin.DomainName}:${portOf(origin, protocol)}`;
}

function OriginCell({ origin }: { origin: Origin }) {
  if (originTypeOf(origin) === ORIGIN_TYPES.custom) return <>{customAddress(origin)}</>;

  // Bucket không thuộc Floci (domain khác dạng S3 của Floci) thì chỉ hiện domain
  const bucket = bucketOfOriginDomain(origin.DomainName ?? "");
  return bucket ? <BucketLink name={bucket} /> : <>{origin.DomainName}</>;
}

export function OriginsTab({
  distribution,
  compact,
}: {
  distribution: Distribution;
  compact: boolean;
}) {
  const id = distribution.Id ?? "";
  const config = distribution.DistributionConfig;
  const origins = config ? originsOf(config) : [];
  const update = useUpdateDistribution(id);
  const [selected, setSelected] = useState<Origin[]>([]);
  const [modal, setModal] = useState<"create" | (typeof MENU)[keyof typeof MENU] | null>(null);
  // Lấy bản mới nhất của dòng đang chọn sau khi trang tải lại
  const target = origins.find((origin) => origin.Id === selected[0]?.Id);
  const usedBy = target && config ? behaviorsUsing(config, target.Id ?? "") : [];

  const barActions: BarAction[] = [
    { id: "create", text: "Create origin", primary: true, onClick: () => setModal("create") },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: MENU.edit, text: "Edit", disabled: !target },
    {
      id: MENU.delete,
      text: "Delete",
      disabled: !target || usedBy.length > 0,
      // Floci cho xóa rồi URL trả 502 "No origin matched the request." (spec 7 #11)
      disabledReason: usedByText(usedBy),
    },
  ];

  const close = () => setModal(null);
  const confirmDelete = () =>
    update.mutate(
      (latest) => withoutOrigin(latest, target?.Id ?? ""),
      notifyOutcome({
        success: `Deleted origin ${target?.Id}`,
        errorHeader: "Couldn't delete origin",
        then: () => {
          close();
          setSelected([]);
        },
      }),
    );

  return (
    <>
      <Table
        items={origins}
        trackBy='Id'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<Origin>("origin", (origin) => origin.Id ?? "")}
        wrapLines={compact}
        header={
          <Header
            counter={`(${origins.length})`}
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={(itemId) =>
                  setModal(itemId === MENU.edit ? MENU.edit : MENU.delete)
                }
              />
            }
          >
            Origins
          </Header>
        }
        columnDefinitions={[
          { id: "id", header: "Origin ID", isRowHeader: true, cell: (origin) => origin.Id },
          {
            id: "type",
            header: "Type",
            cell: (origin) => (originTypeOf(origin) === ORIGIN_TYPES.s3 ? "S3" : "Custom"),
          },
          { id: "origin", header: "Origin", cell: (origin) => <OriginCell origin={origin} /> },
          {
            id: "path",
            header: "Origin path",
            cell: (origin) => origin.OriginPath || NOT_AVAILABLE,
          },
        ]}
        empty={<EmptyState title='No origins' />}
      />
      {config && modal === "create" && (
        <OriginModal distributionId={id} config={config} onDismiss={close} />
      )}
      {config && target && modal === MENU.edit && (
        <OriginModal distributionId={id} config={config} origin={target} onDismiss={close} />
      )}
      <ConfirmModal
        visible={Boolean(target) && modal === MENU.delete}
        header={`Delete origin ${target?.Id}?`}
        actionText='Delete'
        loading={update.isPending}
        onConfirm={confirmDelete}
        onDismiss={close}
      />
    </>
  );
}
