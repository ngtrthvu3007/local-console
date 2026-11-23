import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "../api.ts";
import { FLOCI_PATHS } from "../constants.ts";

const flociInfoQueryKey = ["floci-info"];

// Không dùng zod: hook này nằm trong bundle chính (Layout), zod làm bundle nặng thêm ~90 KB
interface FlociManifest {
  version?: string; // thiếu thì thẻ Floci hiện "—"
  edition?: string;
}

interface FlociHealth {
  services: Record<string, string>;
}

export const useFlociInfo = () =>
  useQuery({
    queryKey: flociInfoQueryKey,
    queryFn: async () => {
      const [manifest, health] = await Promise.all([
        fetchJson<FlociManifest>(FLOCI_PATHS.info),
        fetchJson<FlociHealth>(FLOCI_PATHS.health),
      ]);

      return { ...manifest, services: health.services };
    },
  });
