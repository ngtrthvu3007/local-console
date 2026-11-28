import { describe, expect, it } from "vitest";
import { runEach } from "#shared/utils/bulk.ts";

// Xóa hàng loạt: lỗi một mục không dừng các mục sau, câu lỗi giữ tên mục để UI / MCP báo lại
describe("runEach", () => {
  it("keeps going after a failure and reports it by name", async () => {
    const done: string[] = [];
    const result = await runEach(
      ["a", "b", "c"],
      (name) => name,
      async (name) => {
        if (name === "b") throw Object.assign(new Error("gone"), { name: "QueueDoesNotExist" });
        done.push(name);
      },
    );

    expect(done).toEqual(["a", "c"]);
    expect(result).toEqual({ count: 2, failures: ["b: QueueDoesNotExist: gone"] });
  });
});
