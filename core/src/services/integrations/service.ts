import { listBusSenders } from "./operations/busSenders.ts";
import { listSenders, type SenderKind, type SenderServices } from "./operations/senders.ts";

// Gom nhiều service: ai đang gửi vào một resource qua cấu hình ở trang khác
export function createIntegrationsService(services: SenderServices) {
  return {
    listSenders: (arn: string, kinds: readonly SenderKind[]) => listSenders(services, arn, kinds),
    listBusSenders: (busArn: string) => listBusSenders(services, busArn),
  };
}

export type IntegrationsService = ReturnType<typeof createIntegrationsService>;
