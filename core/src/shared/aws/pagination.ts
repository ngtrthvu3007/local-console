// Gom item của mọi trang từ paginator của AWS SDK (paginateListX…) thành một mảng, giữ thứ tự.
export async function collectPages<Page, Item>(
  pages: AsyncIterable<Page>,
  itemsOf: (page: Page) => readonly Item[] | undefined,
): Promise<Item[]> {
  const items: Item[] = [];
  for await (const page of pages) items.push(...(itemsOf(page) ?? []));
  return items;
}

export async function allPages<T>(
  fetchPage: (nextToken?: string) => Promise<{ items: T[]; nextToken?: string }>,
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | undefined;

  do {
    const page = await fetchPage(nextToken);
    items.push(...page.items);
    nextToken = page.nextToken;
  } while (nextToken);

  return items;
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }

  return batches;
}
