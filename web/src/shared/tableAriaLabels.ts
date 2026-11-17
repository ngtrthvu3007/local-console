import type { TableProps } from "@cloudscape-design/components/table";
import { nounFor } from "./format.ts";

export function selectionLabels<T>(
  noun: string,
  nameOf: (item: T) => string,
): TableProps.AriaLabels<T> {
  return {
    selectionGroupLabel: `${noun} selection`,
    allItemsSelectionLabel: () => `Select all ${nounFor(2, noun)}`,
    itemSelectionLabel: (_selection, item) => `Select ${noun} ${nameOf(item)}`,
  };
}
