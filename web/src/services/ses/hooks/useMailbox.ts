import {
  skipToken,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  MAILBOX_REFRESH_INTERVAL_MS,
  needsMimeFields,
  withMimeFields,
  type Email,
} from "@localconsole/core/ses";
import { useSesService } from "./useSesService.ts";

const mailboxQueryKey = ["ses", "mailbox"];

export function useMailbox(autoRefresh = false) {
  const ses = useSesService();

  return useQuery({
    queryKey: mailboxQueryKey,
    queryFn: ses.listEmails,
    refetchInterval: autoRefresh ? MAILBOX_REFRESH_INTERVAL_MS : false,
  });
}

// Ngoài mailboxQueryKey để Auto refresh không đọc lại MIME (mail không đổi)
export function useEmailContent(email?: Email) {
  const ses = useSesService();

  return useQuery({
    queryKey: ["ses", "email", email?.Id],
    // skipToken thay cho enabled: TypeScript biết email có mặt khi queryFn chạy
    queryFn: email && !email.RejectReason ? () => ses.readEmail(email) : skipToken,
    staleTime: Infinity,
    gcTime: 0,
  });
}

// Không nằm dưới mailboxQueryKey: Refresh, Auto refresh và xóa mail không đọc lại MIME. Chỉ giữ subject + to, bỏ attachment
export function useMimeFields(emails: Email[] | undefined): Email[] | undefined {
  const ses = useSesService();
  const results = useQueries({
    queries: (emails ?? []).filter(needsMimeFields).map((email) => ({
      queryKey: ["ses", "mimeFields", email.Id],
      queryFn: async () => {
        const { subject, to } = await ses.readEmail(email);
        return { subject, to };
      },
      staleTime: Infinity,
    })),
  });

  const pending = (emails ?? []).filter(needsMimeFields);

  return emails?.map((email) => {
    const data = results[pending.indexOf(email)]?.data;
    return data ? withMimeFields(email, data) : email;
  });
}

export function useDeleteEmails() {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => ses.deleteEmails(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailboxQueryKey }),
  });
}
