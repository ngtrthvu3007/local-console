import { fetchJson } from "#shared/http/fetchJson.ts";
import { FLOCI_ENDPOINTS, flociUrl } from "./endpoints.ts";

// Không dùng zod: web gọi facade này từ Layout (bundle chính), zod làm bundle nặng thêm ~90 KB
interface FlociManifest {
  version?: string;
  edition?: string;
}

interface FlociHealth {
  services: Record<string, string>;
}

type FlociInfo = FlociManifest & FlociHealth;

export function createFlociService(baseUrl: string) {
  return {
    getInfo: async (): Promise<FlociInfo> => {
      const [manifest, health] = await Promise.all([
        fetchJson<FlociManifest>(flociUrl(baseUrl, FLOCI_ENDPOINTS.info)),
        fetchJson<FlociHealth>(flociUrl(baseUrl, FLOCI_ENDPOINTS.health)),
      ]);

      return { ...manifest, services: health.services };
    },
    // Xóa dữ liệu của mọi service; Floci trả 409 nếu có service không reset được
    resetData: () => fetchJson(flociUrl(baseUrl, FLOCI_ENDPOINTS.reset), { method: "POST" }),
  };
}
