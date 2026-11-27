import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FLOCI_SERVICE_RUNNING, fetchJson, formatTime } from "@localconsole/core/shared";
import { API_PATHS, HEALTH_REFRESH_INTERVAL_MS } from "../constants.ts";
import { useFlociService } from "./useFlociService.ts";

const healthQueryKey = ["health"];
const flociInfoQueryKey = ["floci-info"];

// Console có gọi được Floci không (đúng kiểu kiểm tra của console contract)
interface Health {
  status: "ok" | "unavailable";
  endpoint: string;
  error?: string;
}

export type FlociState = "checking" | "running" | "down";

export function useFlociStatus() {
  const queryClient = useQueryClient();
  const floci = useFlociService();
  const health = useQuery({
    queryKey: healthQueryKey,
    queryFn: () => fetchJson<Health>(API_PATHS.health),
    refetchInterval: HEALTH_REFRESH_INTERVAL_MS,
  });
  const info = useQuery({ queryKey: flociInfoQueryKey, queryFn: floci.getInfo });

  const state: FlociState = !health.data
    ? "checking"
    : health.data.status === "ok"
      ? "running"
      : "down";
  // Floci tắt thì không hiện số liệu cũ trong cache
  const live = state === "running" ? info.data : undefined;
  const serviceStates = live ? Object.values(live.services) : [];

  return {
    state,
    endpoint: health.data?.endpoint,
    error: health.data?.error,
    checkedAt: formatTime(health.dataUpdatedAt),
    version: live?.version,
    edition: live?.edition,
    servicesRunning: serviceStates.filter((serviceState) => serviceState === FLOCI_SERVICE_RUNNING)
      .length,
    servicesTotal: serviceStates.length,
    // Console server không trả lời /api/health (chỉ gặp khi chạy UI bằng npm run dev:web)
    serverDown: health.isError,
    checking: health.isFetching,
    refresh: () => queryClient.invalidateQueries(),
  };
}
