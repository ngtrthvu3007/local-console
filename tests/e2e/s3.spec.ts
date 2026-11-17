import { expect, test, uniqueName } from "./fixtures.ts";

const bucket = uniqueName("bucket");
const fileName = "ghi-chu.txt";
const fileText = "xin chào từ e2e";

test.describe.configure({ mode: "serial" });

test("create a bucket", async ({ page }) => {
  await page.goto("/s3/buckets/create");
  await page.getByRole("textbox", { name: "Bucket name" }).fill(bucket);
  await page.getByRole("button", { name: "Create bucket" }).click();
  await expect(page).toHaveURL(new RegExp(`/s3/buckets/${bucket}`));
  await expect(page.getByRole("heading", { level: 1, name: bucket })).toBeVisible();
});

test("refuse an invalid bucket name before calling S3", async ({ page }) => {
  await page.goto("/s3/buckets/create");
  const createRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname.startsWith("/aws/")) {
      createRequests.push(request.url());
    }
  });
  await page.getByRole("textbox", { name: "Bucket name" }).fill("Bad_Name");
  await page.getByRole("button", { name: "Create bucket" }).click();
  await expect(page).toHaveURL(/\/s3\/buckets\/create$/);
  await expect(page.getByRole("textbox", { name: "Bucket name" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByText(
      "Use only lowercase letters, numbers, dots (.) and hyphens (-), and start and end with a letter or number.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("3–63 characters: lowercase letters, numbers, dots and hyphens.", {
      exact: true,
    }),
  ).toBeHidden();
  expect(createRequests, "invalid bucket names must not reach S3").toEqual([]);
});

test("upload a file and preview it", async ({ page }) => {
  await page.goto(`/s3/buckets/${bucket}/upload`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(fileText),
    });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  // Upload chạy trong trang: đợi xong rồi mới quay lại bucket
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(new RegExp(`/s3/buckets/${bucket}`));
  await page.getByRole("link", { name: fileName }).click();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByText(fileText)).toBeVisible();
});

test("delete the bucket with its objects", async ({ page }) => {
  await page.goto("/s3/buckets");
  await page.getByRole("searchbox").fill(bucket);
  await page
    .getByRole("row", { name: new RegExp(bucket) })
    .getByRole("radio")
    .or(page.getByRole("row", { name: new RegExp(bucket) }).getByRole("checkbox"))
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  // Bucket còn object: phải gõ đúng tên bucket, nút đổi thành "Empty and delete"
  await dialog.getByRole("textbox").fill(bucket);
  await dialog.getByRole("button", { name: "Empty and delete" }).click();
  await expect(page.getByRole("row", { name: new RegExp(bucket) })).toHaveCount(0);
});
