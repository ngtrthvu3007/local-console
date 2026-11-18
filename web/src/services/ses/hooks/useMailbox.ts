import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@shared/api.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { MAILBOX_ID_PARAM, MAILBOX_PATH, MAILBOX_REFRESH_INTERVAL_MS } from "../constants.ts";
import { mailboxForRegion, mailboxSchema, readEmail, type Email } from "../mailbox.ts";

export const mailboxQueryKey = ["ses", "mailbox"];
const MISSING_ID_FAILURE = "Email has no id, not deleted";

export function useMailbox(autoRefresh = false) {
  const { region } = useLoadedConfig();
  return useQuery({
    queryKey: mailboxQueryKey,
    queryFn: async () => {
      const body = mailboxSchema.parse(await fetchJson<unknown>(MAILBOX_PATH));
      return mailboxForRegion(body.messages, region);
    },
    refetchInterval: autoRefresh ? MAILBOX_REFRESH_INTERVAL_MS : false,
  });
}

// Không nằm dưới mailboxQueryKey: Auto refresh không đọc lại MIME. Mail không đổi nên không đọc lại,
// đóng mail là bỏ kết quả (spec 9: không cache kết quả đọc MIME)
export function useEmailContent(email?: Email) {
  return useQuery({
    queryKey: ["ses", "email", email?.Id],
    // skipToken thay cho enabled: TypeScript biết email có mặt khi queryFn chạy
    queryFn: email && !email.RejectReason ? () => readEmail(email) : skipToken,
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useDeleteEmails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const failures: string[] = [];
      for (const id of ids) {
        // Id rỗng làm DELETE không id, xóa mail của mọi region: không bao giờ gửi
        if (!id.trim()) {
          failures.push(MISSING_ID_FAILURE);
          continue;
        }
        try {
          // Phải xóa theo id: DELETE không id xóa mail của mọi region
          await fetchJson(`${MAILBOX_PATH}?${new URLSearchParams({ [MAILBOX_ID_PARAM]: id })}`, {
            method: "DELETE",
          });
        } catch (error) {
          failures.push(`${id}: ${errorMessage(error)}`);
        }
      }
      return { count: ids.length - failures.length, failures };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailboxQueryKey }),
  });
}
