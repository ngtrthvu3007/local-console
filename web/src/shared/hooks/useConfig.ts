import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "../api.ts";
import { API_PATHS } from "../constants.ts";

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
  });

// Layout chỉ render trang khi đã có config
export const useLoadedConfig = (): ConsoleConfig => useConfig().data!;
