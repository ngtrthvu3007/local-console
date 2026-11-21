import type { ReactNode } from "react";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import { SUCCESS_MESSAGE_LIFETIME_MS } from "../constants.ts";
import { pluralize } from "../format.ts";
import { createStore } from "../store.ts";

type Message = FlashbarProps.MessageDefinition & { id: string };

const FAILURE_PREVIEW_COUNT = 5;
const GENERIC_ERROR_NAME = "Error";

const store = createStore<Message[]>([]);
let nextMessageId = 0;

// Lỗi hạ tầng (mạng, proxy, Floci không trả lời) thì SDK chỉ ra câu kỹ thuật kiểu "DOMParser XML
// parsing error. Deserialization error…": đổi sang câu dễ hiểu. Lỗi của AWS (ResourceNotFound…) giữ nguyên
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed/;
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const DESERIALIZATION_ERROR = "Deserialization error";

interface ErrorDetails {
  name?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
  $response?: { statusCode?: number };
}

function infrastructureMessage(details: ErrorDetails): string | undefined {
  if (details.name === "TypeError" && NETWORK_FAILURE.test(details.message ?? "")) {
    return "Can't reach the console server.";
  }
  const status = details.$metadata?.httpStatusCode ?? details.$response?.statusCode;
  if (status && GATEWAY_STATUSES.has(status)) {
    return `Floci didn't answer (HTTP ${status}). Check that it's running.`;
  }
  if (details.message?.includes(DESERIALIZATION_ERROR)) {
    return `Floci sent an unexpected response${status ? ` (HTTP ${status})` : ""}.`;
  }
  return undefined;
}

export function errorMessage(error: unknown): string {
  const details = error as ErrorDetails;
  if (!details?.message) return String(error);
  const infrastructure = infrastructureMessage(details);
  if (infrastructure) return infrastructure;
  return details.name && details.name !== GENERIC_ERROR_NAME
    ? `${details.name}: ${details.message}`
    : details.message;
}

function notify(message: Omit<Message, "id" | "dismissible" | "onDismiss">) {
  const id = String(nextMessageId++);
  const remove = () => store.set(store.get().filter((existing) => existing.id !== id));
  store.set([...store.get(), { ...message, id, dismissible: true, onDismiss: remove }]);
  if (message.type === "success") setTimeout(remove, SUCCESS_MESSAGE_LIFETIME_MS);
}

// `action`: nút/link đi kèm, vd: "Upload a file" sau khi thêm trigger S3
export const notifySuccess = (content: string, action?: ReactNode) =>
  notify({ type: "success", content, action });

// Thông báo cập nhật liên tục (vd: tiến trình upload): cùng id thì thay tại chỗ, null thì gỡ.
// Không có nút đóng, nơi tạo tự gỡ khi xong.
export function setLiveMessage(id: string, message: Omit<Message, "id"> | null) {
  const messages = store.get();
  if (!message) return store.set(messages.filter((existing) => existing.id !== id));
  const live = { ...message, id };
  const exists = messages.some((existing) => existing.id === id);
  store.set(
    exists
      ? messages.map((existing) => (existing.id === id ? live : existing))
      : [...messages, live],
  );
}

export const notifyError = (error: unknown, header?: string) =>
  notify({ type: "error", header, content: errorMessage(error) });

// Kết quả hàng loạt: thành công, hoặc cảnh báo kèm vài mục lỗi đầu
export function notifyBulkResult(doneMessage: string, failures: string[]) {
  if (!failures.length) return notifySuccess(doneMessage);
  notify({
    type: "warning",
    header: `${doneMessage}, ${pluralize(failures.length, "item")} failed`,
    content: failures.slice(0, FAILURE_PREVIEW_COUNT).join("\n"),
  });
}

const dismissErrors = (header: string) =>
  store.set(
    store.get().filter((message) => !(message.type === "error" && message.header === header)),
  );

// Option cho mutation.mutate: báo thành công/lỗi rồi chạy tiếp.
// Thành công thì đóng lỗi cũ của cùng thao tác (vd: lần thử trước thất bại).
export function notifyOutcome<TResult>(options: {
  success: string | ((result: TResult) => string);
  successAction?: ReactNode;
  errorHeader: string;
  then?: (result: TResult) => void;
}) {
  return {
    onSuccess: (result: TResult) => {
      dismissErrors(options.errorHeader);
      notifySuccess(
        typeof options.success === "function" ? options.success(result) : options.success,
        options.successAction,
      );
      options.then?.(result);
    },
    onError: (error: unknown) => notifyError(error, options.errorHeader),
  };
}

// Chạy lần lượt từng mục, gom lỗi theo tên: kết quả đúng hình notifyBulkOutcome cần
export async function runEach<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  run: (item: T) => Promise<unknown>,
) {
  const failures: string[] = [];
  for (const item of items) {
    try {
      await run(item);
    } catch (error) {
      failures.push(`${nameOf(item)}: ${errorMessage(error)}`);
    }
  }
  return { count: items.length - failures.length, failures };
}

// Như notifyOutcome, cho thao tác hàng loạt có thể lỗi một phần
export function notifyBulkOutcome<TResult extends { failures: string[] }>(options: {
  success: (result: TResult) => string;
  errorHeader: string;
  then?: () => void;
}) {
  return {
    onSuccess: (result: TResult) => {
      dismissErrors(options.errorHeader);
      notifyBulkResult(options.success(result), result.failures);
      options.then?.();
    },
    onError: (error: unknown) => notifyError(error, options.errorHeader),
  };
}

export const useNotifications = store.use;
