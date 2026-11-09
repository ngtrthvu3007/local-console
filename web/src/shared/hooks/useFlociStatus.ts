import { useQueryClient } from "@tanstack/react-query";
import { FLOCI_SERVICE_RUNNING } from "../constants.ts";
import { formatTime } from "../format.ts";
import { useFlociInfo } from "./useFlociInfo.ts";
import { useHealth } from "./useHealth.ts";

export type FlociState = "checking" | "running" | "down";

export function useFlociStatus() {
  const queryClient = useQueryClient();
  const health = useHealth();
  const info = useFlociInfo();

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
    refresh: () => queryClient.invalidateQueries(),
  };
}
