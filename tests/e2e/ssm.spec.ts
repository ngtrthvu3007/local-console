import type { Page } from "@playwright/test";
import {
  DeleteParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của Parameter Store trên UI. Tên dạng path để kiểm ?name=. Dọn bằng SDK ở afterAll

const root = `/${uniqueName("param")}`;
const host = `${root}/db-host`;
const password = `${root}/db-password`;
const flags = `${root}/feature-flags`;
const pem = `${root}/private-key`;
const PEM_VALUE = "-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----";
const bulkRoot = `/${uniqueName("bulk")}`;
const BULK_COUNT = 12;
const bulk = Array.from({ length: BULK_COUNT }, (_, index) => `${bulkRoot}/p${index}`);

test.describe.configure({ mode: "serial" });

let ssm: SSMClient;

test.beforeAll(async () => {
  ssm = new SSMClient(viaConsole((await consoleConfig()).region));
  for (const name of bulk) {
    await ssm.send(new PutParameterCommand({ Name: name, Value: "x", Type: "String" }));
  }
});

test.afterAll(async () => {
  const names = [host, password, flags, pem, ...bulk];
  for (let start = 0; start < names.length; start += 10) {
    await ssm
      .send(new DeleteParametersCommand({ Names: names.slice(start, start + 10) }))
      .catch(() => undefined);
  }
});

const open = (page: Page, name: string) =>
  page.goto(`/ssm/parameters/detail?${new URLSearchParams({ name })}`);

async function create(page: Page, name: string, type: string, value: string) {
  await page.goto("/ssm/parameters");
  await page.getByRole("link", { name: "Create parameter" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByText(type, { exact: true }).click();
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(value);
  await page.getByRole("button", { name: "Create parameter" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("creates a String parameter", async ({ page }) => {
  await page.goto("/ssm/parameters");
  await expect(
    page.getByRole("link", { name: "Parameter Store", exact: true }).first(),
  ).toBeVisible();
  await create(page, host, "String", "localhost");
  await expect(page).toHaveURL(/\/ssm\/parameters\/detail\?name=/);
  await expect(page.getByText("localhost", { exact: true })).toBeVisible();
});

test("a SecureString is hidden until shown", async ({ page }) => {
  await create(page, password, "SecureString", "s3cret");
  await expect(page.getByText("s3cret")).toHaveCount(0);
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("s3cret", { exact: true })).toBeVisible();
});

test("a multi-line SecureString keeps its line breaks and is masked while typing", async ({
  page,
}) => {
  await page.goto("/ssm/parameters/create");
  await page.getByRole("textbox", { name: "Name" }).fill(pem);
  await page.getByText("SecureString", { exact: true }).click();
  const value = page.getByRole("textbox", { name: "Value", exact: true });
  await value.fill(PEM_VALUE);
  await expect(value).toHaveCSS("-webkit-text-security", "disc");
  await page.getByRole("checkbox", { name: "Show value" }).check();
  await expect(value).toHaveCSS("-webkit-text-security", "none");
  await page.getByRole("button", { name: "Create parameter" }).click();

  await expect(page.getByRole("heading", { level: 1, name: pem })).toBeVisible();
  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: pem }));
  expect(Parameter?.Value).toBe(PEM_VALUE);
});

test("a StringList keeps its commas", async ({ page }) => {
  await create(page, flags, "StringList", "a,b,c");
  await expect(page.getByText("a,b,c", { exact: true })).toBeVisible();
});

test("edits a parameter; the name is locked", async ({ page }) => {
  await open(page, host);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveCount(0);
  await expect(page.getByText(host).first()).toBeVisible();
  await page.getByRole("textbox", { name: "Value", exact: true }).fill("db.local");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("db.local", { exact: true })).toBeVisible();
  await expect(page.getByText(/^2 · /)).toBeVisible();
  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: host }));
  expect(Parameter?.Version).toBe(2);
});

test("a name with / that doesn't start with / is rejected", async ({ page }) => {
  await page.goto("/ssm/parameters/create");
  await page.getByRole("textbox", { name: "Name" }).fill("app/dev");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill("x");
  await page.getByRole("button", { name: "Create parameter" }).click();
  await expect(page.getByText("A name with / must start with /.")).toBeVisible();
});

test("deletes several parameters at once", async ({ page }) => {
  await page.goto("/ssm/parameters");
  await page.getByPlaceholder("Find parameters by name or path").fill(bulkRoot);
  await expect(page.getByRole("row")).toHaveCount(BULK_COUNT + 1);
  await page.getByRole("checkbox", { name: "Select all parameters" }).check();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(flash(page)).toContainText(`Deleted ${BULK_COUNT} parameters`);
  await expect(page.getByText("No matches")).toBeVisible();
});

test.describe("missing parameter", () => {
  test.use({ danglingProbes: true });

  test("an unknown parameter shows not found", async ({ page }) => {
    await open(page, "/lc-e2e-missing");
    await expect(page.getByText("Parameter /lc-e2e-missing not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "View parameters" })).toBeVisible();
  });
});
