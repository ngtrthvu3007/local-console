import { FILTER_OPERATORS, SORT_KEY_OPERATORS, VALUELESS_FILTER_OPERATORS } from "./constants.ts";
import type { FilterCondition, ItemSearch } from "./expressions.ts";
import type { IndexKeys } from "./hooks/useTables.ts";
import type { ItemPage } from "./hooks/useItems.ts";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";

const operatorWord = (label: string) => label.toLowerCase();

function filterText(filter: FilterCondition) {
  const operator = operatorWord(FILTER_OPERATORS[filter.operator]);
  if (VALUELESS_FILTER_OPERATORS.includes(filter.operator))
    return `${filter.attribute} ${operator}`;
  if (filter.operator === "between") {
    return `${filter.attribute} between ${filter.value} and ${filter.secondValue}`;
  }
  return `${filter.attribute} ${operator} ${filter.value}`;
}

// Đọc lại điều kiện đang chạy thành một câu: "Query on status-index · status = DONE · 2 filters"
export function searchSummary(table: string, search: ItemSearch, keys: IndexKeys): string {
  const target = search.indexName ?? table;
  const parts = [`${search.mode === "query" ? "Query" : "Scan"} on ${target}`];
  if (search.mode === "query") {
    parts.push(`${keys.partitionKey.name} = ${search.partitionKeyValue}`);
    const sortKey = search.sortKey;
    if (keys.sortKey && sortKey?.value.trim()) {
      const operator = operatorWord(SORT_KEY_OPERATORS[sortKey.operator]);
      parts.push(
        sortKey.operator === "between"
          ? `${keys.sortKey.name} between ${sortKey.value} and ${sortKey.secondValue}`
          : `${keys.sortKey.name} ${operator} ${sortKey.value}`,
      );
    }
    if (search.descending) parts.push("descending");
  }
  // Một filter thì đọc nguyên văn, nhiều filter thì đếm cho câu khỏi dài
  if (search.filters.length === 1) parts.push(filterText(search.filters[0]));
  if (search.filters.length > 1) parts.push(pluralize(search.filters.length, "filter"));
  return parts.join(DETAIL_SEPARATOR);
}

// "12 returned, 50 scanned" khi filter bỏ bớt item, ngược lại chỉ "12 returned"
export function resultSummary(pages: ItemPage[]): string {
  const returned = pages.reduce((total, page) => total + page.count, 0);
  const scanned = pages.reduce((total, page) => total + page.scannedCount, 0);
  const returnedText = `${returned.toLocaleString()} returned`;
  return scanned > returned ? `${returnedText}, ${scanned.toLocaleString()} scanned` : returnedText;
}
