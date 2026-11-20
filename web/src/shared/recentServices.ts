import { useEffect, useSyncExternalStore } from "react";
import { services, type ServiceDefinition } from "../registry.ts";
import { readStorage, writeStorage } from "./storage.ts";

// Service mở gần đây: hiện trên Home và trong ô search
export const MAX_RECENT_SERVICES = 4;
export const RECENT_SERVICES_TITLE = "Recently visited";
const STORAGE_KEY = "localconsole:recent-services";
// Sự kiện "storage" chỉ báo cho tab khác; tab đang ghi tự báo để Home cập nhật
const CHANGE_EVENT = "localconsole:recent-services-change";

// Đoạn đầu đường dẫn là id service: /sqs/queues/a → "sqs"; Home, /s3x/… → không
export const serviceIdFromPath = (pathname: string, ids: readonly string[]) => {
  const segment = pathname.split("/")[1];
  return ids.find((id) => id === segment);
};

export const pushRecent = (
  recent: string[],
  id: string,
  max = MAX_RECENT_SERVICES,
) => [id, ...recent.filter((other) => other !== id)].slice(0, max);

// Storage có thể chứa rác hoặc id service đã gỡ: bỏ qua thay vì làm hỏng Home
export function parseRecent(
  raw: string | null,
  ids: readonly string[],
): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => ids.includes(id)) : [];
  } catch {
    return [];
  }
}

export function matchServices<T extends { name: string; fullName: string }>(
  items: T[],
  text: string,
) {
  const query = text.trim().toLowerCase();
  return items.filter((item) =>
    [item.name, item.fullName].some((value) =>
      value.toLowerCase().includes(query),
    ),
  );
}

const readRaw = () => readStorage(STORAGE_KEY);

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

const SERVICE_IDS = services.map((service) => service.id);

export function useRecentServices(): ServiceDefinition[] {
  // Snapshot là chuỗi raw: so sánh ổn định, nội dung không đổi thì không render
  const raw = useSyncExternalStore(subscribe, readRaw);
  return parseRecent(raw, SERVICE_IDS).flatMap((id) =>
    services.filter((service) => service.id === id),
  );
}

export function useRecordRecentService(pathname: string) {
  useEffect(() => {
    const id = serviceIdFromPath(pathname, SERVICE_IDS);
    if (!id) return;
    const recent = pushRecent(parseRecent(readRaw(), SERVICE_IDS), id);
    writeStorage(STORAGE_KEY, JSON.stringify(recent));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [pathname]);
}
