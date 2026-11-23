import { isValidElement, type ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import CloudscapeTable, { type TableProps } from "@cloudscape-design/components/table";
import { ITEM_LIST_WIDTH_PX } from "../constants.ts";
import { useIsCompact } from "../hooks/useIsCompact.ts";
import "./ResponsiveTable.css";

export type { TableProps } from "@cloudscape-design/components/table";

function headerText(header: ReactNode): string {
  if (typeof header === "string" || typeof header === "number") return String(header);
  if (isValidElement<{ children?: ReactNode }>(header)) return headerText(header.props.children);
  return "Column";
}

// Giữ selection, phân trang, phím tắt của Cloudscape; khung hẹp thì mỗi dòng là tiêu đề + các cột có nhãn
export default function ResponsiveTable<T>(props: TableProps<T>) {
  const { ref, compact: phone } = useIsCompact(ITEM_LIST_WIDTH_PX);

  const visibleColumns = props.columnDisplay
    ? props.columnDisplay.flatMap(({ id, visible }) =>
        visible ? props.columnDefinitions.filter((column) => column.id === id) : [],
      )
    : props.columnDefinitions;

  const primary = visibleColumns.find((column) => column.isRowHeader) ?? visibleColumns[0];
  const details = visibleColumns.filter((column) => column !== primary);
  // Bảng có sửa inline thì giữ dạng bảng: editor cần ô gốc của bảng
  const stacked = phone && primary && !visibleColumns.some((column) => column.editConfig);

  const columns = stacked
    ? [
        {
          ...primary,
          width: undefined,
          minWidth: undefined,
          maxWidth: undefined,
          cell: (item: T) => (
            <div className='mobile-table-row'>
              <div className='mobile-table-row__name'>{primary.cell(item)}</div>
              {details.length > 0 && (
                <dl className='mobile-table-row__details'>
                  {details.map((column, index) => (
                    <div key={column.id ?? index}>
                      <dt>
                        <Box color='text-body-secondary'>{headerText(column.header)}</Box>
                      </dt>
                      <dd>{column.cell(item)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ),
        },
      ]
    : props.columnDefinitions;

  const sortable = visibleColumns.filter(
    (column) => column.sortingField || column.sortingComparator,
  );

  const sortIndex = sortable.findIndex((column) =>
    column.sortingComparator
      ? column.sortingComparator === props.sortingColumn?.sortingComparator
      : column.sortingField === props.sortingColumn?.sortingField,
  );

  const sortOptions = sortable.map((column, index) => ({
    value: String(index),
    label: headerText(column.header),
  }));

  const selectedCount = props.selectedItems?.length ?? 0;
  const mobileTools =
    phone && (selectedCount > 0 || (sortable.length > 1 && props.onSortingChange));

  const filter = mobileTools ? (
    <SpaceBetween size='s'>
      {props.filter}
      {sortable.length > 1 && props.onSortingChange && (
        <div className='mobile-table-sort'>
          <FormField label='Sort by'>
            <Select
              disabled={props.sortingDisabled}
              options={sortOptions}
              selectedOption={sortOptions[sortIndex] ?? null}
              placeholder='Choose a column'
              onChange={({ detail }) =>
                props.onSortingChange?.(
                  new CustomEvent("sortingchange", {
                    detail: {
                      sortingColumn: sortable[Number(detail.selectedOption.value)],
                      isDescending: Boolean(props.sortingDescending),
                    },
                  }),
                )
              }
            />
          </FormField>
          <Button
            ariaLabel={props.sortingDescending ? "Sort ascending" : "Sort descending"}
            iconName={props.sortingDescending ? "angle-up" : "angle-down"}
            disabled={props.sortingDisabled || sortIndex < 0}
            onClick={() =>
              props.onSortingChange?.(
                new CustomEvent("sortingchange", {
                  detail: {
                    sortingColumn: sortable[sortIndex],
                    isDescending: !props.sortingDescending,
                  },
                }),
              )
            }
          />
        </div>
      )}
      {selectedCount > 0 && (
        <div role='status'>
          <Box color='text-body-secondary'>{selectedCount} selected</Box>
        </div>
      )}
    </SpaceBetween>
  ) : (
    props.filter
  );

  return (
    <div ref={ref} className='console-table' data-mobile={phone || undefined}>
      <CloudscapeTable
        {...props}
        columnDefinitions={columns}
        columnDisplay={stacked ? undefined : props.columnDisplay}
        stickyColumns={stacked ? undefined : props.stickyColumns}
        resizableColumns={stacked ? false : props.resizableColumns}
        wrapLines={phone || props.wrapLines}
        cellVerticalAlign={phone ? "top" : props.cellVerticalAlign}
        filter={filter}
      />
    </div>
  );
}
