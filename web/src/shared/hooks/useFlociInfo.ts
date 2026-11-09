import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "../api.ts";
import { FLOCI_PATHS } from "../constants.ts";

const flociInfoQueryKey = ["floci-info"];

export interface FlociInfo {
  version: string;
  edition: string;
  services: Record<string, string>;
}

type FlociManifest = Pick<FlociInfo, "version" | "edition">;
type FlociServiceStates = Pick<FlociInfo, "services">;

export const useFlociInfo = () =>
  useQuery({
    queryKey: flociInfoQueryKey,
    queryFn: async (): Promise<FlociInfo> => {
      const [manifest, health] = await Promise.all([
        fetchJson<FlociManifest>(FLOCI_PATHS.info),
        fetchJson<FlociServiceStates>(FLOCI_PATHS.health),
      ]);
      return { ...manifest, services: health.services };
    },
  });
