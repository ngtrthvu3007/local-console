import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@localconsole/core/shared";
import { API_PATHS, HEALTH_REFRESH_INTERVAL_MS } from "../constants.ts";

const configQueryKey = ["config"];

interface ConsoleConfig {
  region: string;
  flociPublicUrl: string;
  flociInternalUrl: string;
}

export const useConfig = () =>
  useQuery({
    queryKey: configQueryKey,
    queryFn: () => fetchJson<ConsoleConfig>(API_PATHS.config),
    staleTime: Infinity,
    // Server chưa chạy: thử lại theo nhịp kiểm tra Floci để trang tự hiện khi server lên
    refetchInterval: (query) =>
      query.state.status === "error" ? HEALTH_REFRESH_INTERVAL_MS : false,
  });

// Layout chỉ render trang khi đã có config
export const useLoadedConfig = (): ConsoleConfig => useConfig().data!;
