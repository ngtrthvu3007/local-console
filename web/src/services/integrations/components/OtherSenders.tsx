import { useQuery } from "@tanstack/react-query";
import type { SenderKind } from "@localconsole/core/integrations";
import { useIntegrationsService } from "../hooks/useIntegrationsService.ts";
import { SendersTable } from "./SendersTable.tsx";

interface Props {
  arn: string;
  // Nguồn quét được tuỳ loại resource (queue / topic / function)
  kinds: readonly SenderKind[];
}

// S3, Lambda và SES đang gửi vào resource này qua cấu hình ở trang của chúng
export function OtherSenders({ arn, kinds }: Props) {
  const integrations = useIntegrationsService();
  const senders = useQuery({
    queryKey: ["senders", arn, ...kinds],
    queryFn: () => integrations.listSenders(arn, kinds),
  });
  return (
    <SendersTable
      rows={senders.data ?? []}
      title='Other senders'
      description='S3, Lambda and SES settings that send here.'
    />
  );
}
