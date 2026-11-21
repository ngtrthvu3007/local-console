import {
  DeleteEventBusCommand,
  EventBridgeClient,
  ListEventBusesCommand,
} from "@aws-sdk/client-eventbridge";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, flash, test, uniqueName } from "./fixtures.ts";

// Luồng chính của trang Event buses trên UI: tạo bus → gửi event → xóa bus.
// Bus dọn bằng SDK ở afterAll để test lỗi giữa chừng vẫn sạch.

const bus = uniqueName("bus");

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  const events = new EventBridgeClient(viaConsole((await consoleConfig()).region));
  const { EventBuses = [] } = await events.send(new ListEventBusesCommand({ NamePrefix: bus }));
  for (const { Name } of EventBuses) await events.send(new DeleteEventBusCommand({ Name }));
});

test("create an event bus, reject default and invalid names", async ({ page }) => {
  await page.goto("/eventbridge/buses");
  await page.getByRole("button", { name: "Create event bus" }).first().click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Name").fill("default");
  await dialog.getByRole("button", { name: "Create event bus" }).click();
  await expect(dialog.getByText('"default" already exists.')).toBeVisible();

  await dialog.getByLabel("Name").fill("not valid");
  await expect(dialog.getByText(/Use only letters, numbers/)).toBeVisible();

  await dialog.getByLabel("Name").fill(bus);
  await dialog.getByRole("button", { name: "Create event bus" }).click();
  await expect(flash(page).getByText(`Created event bus ${bus}`)).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(bus) })).toBeVisible();
});

test("send an event to the new bus; default bus can't be selected for delete", async ({ page }) => {
  await page.goto("/eventbridge/buses");
  await expect(page.getByRole("row", { name: /default/ }).getByRole("checkbox")).toBeDisabled();

  await page.getByRole("button", { name: "Send events" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByText("Enter a detail type.")).toBeVisible();

  await dialog.getByLabel("Detail type").fill("OrderCreated");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(flash(page).getByText(/^Sent event /)).toBeVisible();
});

test("delete the bus", async ({ page }) => {
  await page.goto("/eventbridge/buses");
  await page
    .getByRole("row", { name: new RegExp(bus) })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("delete").fill("delete");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(flash(page).getByText("Deleted 1 event bus")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(bus) })).toHaveCount(0);
});
