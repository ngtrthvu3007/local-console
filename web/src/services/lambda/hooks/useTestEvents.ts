import { useState } from "react";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

// Tên event → JSON. Lưu trong localStorage theo region + function: xóa dữ liệu trình duyệt là mất
export type SavedTestEvents = Record<string, string>;

const STORAGE_PREFIX = "localconsole:lambda:test-events";

function readEvents(storageKey: string): SavedTestEvents {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  } catch {
    return {};
  }
}

export function useTestEvents(functionName: string) {
  const { region } = useLoadedConfig();
  const storageKey = `${STORAGE_PREFIX}:${region}:${functionName}`;
  const [events, setEvents] = useState(() => readEvents(storageKey));

  const persist = (nextEvents: SavedTestEvents) => {
    localStorage.setItem(storageKey, JSON.stringify(nextEvents));
    setEvents(nextEvents);
  };

  return {
    events,
    save: (name: string, json: string) => persist({ ...events, [name]: json }),
    remove: (name: string) => {
      const { [name]: _removed, ...rest } = events;
      persist(rest);
    },
  };
}
