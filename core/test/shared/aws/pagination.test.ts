import { describe, expect, it } from "vitest";
import { collectPages } from "#shared/aws/pagination.ts";

// Paginator giả của AWS SDK: async iterable các trang, có trang thiếu mảng item
async function* pages() {
  yield { Items: [1, 2] };
  yield {};
  yield { Items: [3] };
}

describe("collectPages", () => {
  it("joins the items of every page in order and skips pages without items", async () => {
    await expect(collectPages(pages(), (page) => page.Items)).resolves.toEqual([1, 2, 3]);
  });
});
