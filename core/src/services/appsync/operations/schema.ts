import {
  GetIntrospectionSchemaCommand,
  GetSchemaCreationStatusCommand,
  StartSchemaCreationCommand,
  type AppSyncClient,
} from "@aws-sdk/client-appsync";
import { orEmptyWhenNotFound } from "#shared/aws/errors.ts";
import { schemaErrors, sdlOfIntrospection } from "#services/appsync/apis.ts";
import { SCHEMA_POLL, SCHEMA_STATUS, SCHEMA_TIMEOUT } from "#services/appsync/constants.ts";

// Đọc schema dạng SDL (format JSON của Floci cũng trả SDL, spec 7 #2)
const SCHEMA_FORMAT = "SDL";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// SDL đã lưu; null = API chưa có schema (Floci trả 404, spec 7 #17)
export const getSchema = (appsync: AppSyncClient, apiId: string) =>
  orEmptyWhenNotFound(async () => {
    const { schema } = await appsync.send(
      new GetIntrospectionSchemaCommand({ apiId, format: SCHEMA_FORMAT }),
    );
    return schema ? sdlOfIntrospection(textDecoder.decode(schema)) : null;
  }, null);

// Lưu schema bất đồng bộ: hỏi trạng thái tới khi xong (spec 7 #3). FAILED → lỗi gom từ details
export async function saveSchema(appsync: AppSyncClient, apiId: string, sdl: string) {
  await appsync.send(
    new StartSchemaCreationCommand({ apiId, definition: textEncoder.encode(sdl) }),
  );

  for (let waited = 0; waited < SCHEMA_POLL.timeoutMs; waited += SCHEMA_POLL.intervalMs) {
    await sleep(SCHEMA_POLL.intervalMs);
    const { status, details } = await appsync.send(new GetSchemaCreationStatusCommand({ apiId }));
    if (status === SCHEMA_STATUS.success) return;
    if (status === SCHEMA_STATUS.failed) throw new Error(schemaErrors(details).join("\n"));
  }
  throw new Error(SCHEMA_TIMEOUT);
}
