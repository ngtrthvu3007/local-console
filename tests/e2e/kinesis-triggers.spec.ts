import { strToU8, zipSync } from "fflate";
import { CreateStreamCommand, DeleteStreamCommand, KinesisClient } from "@aws-sdk/client-kinesis";
import {
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
// Có sẵn qua mọi client AWS SDK (phụ thuộc chung), không khai báo riêng trong package.json
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { ACCOUNT_ID, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { choose, confirmDelete, expect, flash, test, uniqueName } from "./fixtures.ts";

// Trigger Kinesis trên UI (spec Kinesis 3.1, 3.6, 3.7): Add / Edit ở Lambda › Triggers, Add ở trang
// stream, cảnh báo khi xóa stream còn trigger, trigger của stream đã xóa hiện "(not found)"

const fn = uniqueName("kinesis-fn");
const fromLambda = uniqueName("kinesis-lambda");
const fromStream = uniqueName("kinesis-page");
const EDITED_BATCH_SIZE = 20;

test.describe.configure({ mode: "serial" });

let kinesis: KinesisClient;
let lambda: LambdaClient;

const mappingsOf = async (streamName: string) => {
  const { EventSourceMappings = [] } = await lambda.send(
    new ListEventSourceMappingsCommand({ FunctionName: fn }),
  );
  return EventSourceMappings.filter((mapping) =>
    mapping.EventSourceArn?.endsWith(`/${streamName}`),
  );
};

test.beforeAll(async () => {
  const config = viaConsole((await consoleConfig()).region);
  // SDK Kinesis trên Node mặc định HTTP/2, proxy /aws của console chỉ nói HTTP/1.1 (spec 7 #13)
  kinesis = new KinesisClient({ ...config, requestHandler: new NodeHttpHandler() });
  lambda = new LambdaClient(config);

  for (const name of [fromLambda, fromStream])
    await kinesis.send(
      new CreateStreamCommand({ StreamName: name, StreamModeDetails: { StreamMode: "ON_DEMAND" } }),
    );
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: fn,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-lambda`,
      Code: {
        ZipFile: zipSync({ "index.mjs": strToU8("export const handler = async () => {};") }),
      },
    }),
  );
  await waitFor("function to be Active", async () => {
    const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: fn }));
    return Configuration?.State === "Active" ? true : undefined;
  });
});

test.afterAll(async () => {
  const quiet = (promise: Promise<unknown>) => promise.catch(() => undefined);
  const { EventSourceMappings = [] } = await lambda.send(
    new ListEventSourceMappingsCommand({ FunctionName: fn }),
  );
  for (const { UUID } of EventSourceMappings)
    await quiet(lambda.send(new DeleteEventSourceMappingCommand({ UUID })));
  await quiet(lambda.send(new DeleteFunctionCommand({ FunctionName: fn })));
  for (const name of [fromLambda, fromStream])
    await quiet(
      kinesis.send(new DeleteStreamCommand({ StreamName: name, EnforceConsumerDeletion: true })),
    );
});

test("adds a Kinesis trigger from Lambda › Triggers", async ({ page }) => {
  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  // Bảng rỗng có thêm nút Add trigger ở EmptyState
  await page.getByRole("button", { name: "Add trigger" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Kinesis" }).click();
  // Chưa chọn stream thì form chặn
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText("Choose a data stream.")).toBeVisible();

  await choose(page, dialog, /^Data stream/, { name: fromLambda });
  await choose(page, dialog, /^Starting position/, { name: "Trim horizon" });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(flash(page)).toContainText("Added Kinesis trigger");

  // Resource link sang trang stream
  await expect(page.getByRole("link", { name: fromLambda, exact: true })).toHaveAttribute(
    "href",
    `/kinesis/streams/${fromLambda}`,
  );
  const [mapping] = await mappingsOf(fromLambda);
  expect(mapping.StartingPosition).toBe("TRIM_HORIZON");
});

test("edits the batch size of the Kinesis trigger", async ({ page }) => {
  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  await page
    .getByRole("row", { name: new RegExp(fromLambda) })
    .getByRole("radio")
    .click();
  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Batch size" }).fill(String(EDITED_BATCH_SIZE));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(flash(page)).toContainText(`Updated trigger ${fromLambda}`);

  const [mapping] = await mappingsOf(fromLambda);
  expect(mapping.BatchSize).toBe(EDITED_BATCH_SIZE);
});

test("adds a trigger from the stream's Lambda triggers tab", async ({ page }) => {
  await page.goto(`/kinesis/streams/${fromStream}?tab=lambda-triggers`);
  await expect(page.getByText("No Lambda reads this stream yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add trigger" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Add Lambda trigger/ });
  await choose(page, dialog, /^Function/, { name: new RegExp(fn) });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(flash(page)).toContainText(`${fn} now runs when records arrive in ${fromStream}`);
  await expect(page.getByRole("row", { name: new RegExp(fn) })).toBeVisible();
});

test("warns that triggers stay when deleting a stream, then shows them as not found", async ({
  page,
}) => {
  await page.goto("/kinesis/streams");
  await page.getByRole("searchbox").fill(fromStream);
  await page
    .getByRole("row", { name: new RegExp(fromStream) })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`${fromStream} has Lambda triggers`);
  await confirmDelete(dialog);
  await expect(page.getByRole("row", { name: new RegExp(fromStream) })).toHaveCount(0);

  await page.goto(`/lambda/functions/${fn}?tab=triggers`);
  await expect(page.getByText(`${fromStream} (not found)`)).toBeVisible();
});
