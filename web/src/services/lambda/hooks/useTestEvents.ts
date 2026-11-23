import { useState } from "react";
import { z } from "zod";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { readStorage, writeStorage } from "@shared/storage.ts";

// Tên event → JSON. Lưu trong localStorage theo region + function: xóa dữ liệu trình duyệt là mất
const savedTestEventsSchema = z.record(z.string(), z.string()).catch({});
type SavedTestEvents = z.infer<typeof savedTestEventsSchema>;

const STORAGE_PREFIX = "localconsole:lambda:test-events";

function readEvents(storageKey: string): SavedTestEvents {
  try {
    return savedTestEventsSchema.parse(JSON.parse(readStorage(storageKey) ?? "{}"));
  } catch {
    return {};
  }
}

export function useTestEvents(functionName: string) {
  const { region } = useLoadedConfig();
  const storageKey = `${STORAGE_PREFIX}:${region}:${functionName}`;
  const [events, setEvents] = useState(() => readEvents(storageKey));

  const persist = (nextEvents: SavedTestEvents) => {
    writeStorage(storageKey, JSON.stringify(nextEvents));
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
