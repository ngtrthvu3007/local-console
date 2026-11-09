import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "../api.ts";
import { API_PATHS, HEALTH_REFRESH_INTERVAL_MS } from "../constants.ts";

const healthQueryKey = ["health"];

// Console có gọi được Floci không (đúng kiểu kiểm tra của console contract)
export interface Health {
  status: "ok" | "unavailable";
  endpoint: string;
  error?: string;
}

export const useHealth = () =>
  useQuery({
    queryKey: healthQueryKey,
    queryFn: () => fetchJson<Health>(API_PATHS.health),
    refetchInterval: HEALTH_REFRESH_INTERVAL_MS,
  });
