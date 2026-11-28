import { FLOCI_ENDPOINTS, flociUrl } from "#shared/floci/endpoints.ts";
import { fetchJson } from "#shared/http/fetchJson.ts";
import { errorMessage } from "#shared/utils/errorMessage.ts";
import { MAILBOX_ID_PARAM } from "#services/ses/constants.ts";
import { newestInRegion } from "#shared/floci/inbox.ts";
import { mailboxSchema } from "#services/ses/mailbox.ts";

const MISSING_ID_FAILURE = "Email has no id, not deleted";

// Hộp thư của Floci gom mọi region
export async function listEmails(baseUrl: string, region: string) {
  const body = mailboxSchema.parse(
    await fetchJson<unknown>(flociUrl(baseUrl, FLOCI_ENDPOINTS.sesMailbox)),
  );
  return newestInRegion(body.messages, region);
}

export async function deleteEmails(baseUrl: string, ids: readonly string[]) {
  const failures: string[] = [];

  for (const id of ids) {
    // DELETE không id xóa mail của mọi region: id rỗng thì không gửi
    if (!id.trim()) {
      failures.push(MISSING_ID_FAILURE);
      continue;
    }

    try {
      await fetchJson(flociUrl(baseUrl, FLOCI_ENDPOINTS.sesMailbox, { [MAILBOX_ID_PARAM]: id }), {
        method: "DELETE",
      });
    } catch (error) {
      failures.push(`${id}: ${errorMessage(error)}`);
    }
  }

  return { count: ids.length - failures.length, failures };
}
