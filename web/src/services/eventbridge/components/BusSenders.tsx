import { useQuery } from "@tanstack/react-query";
import { SendersTable } from "../../integrations/components/SendersTable.tsx";
import { useIntegrationsService } from "../../integrations/hooks/useIntegrationsService.ts";
import { EVENTBRIDGE_QUERY_ROOT } from "../hooks/useBuses.ts";

// Lambda (đích async) và configuration set của SES đang gửi event vào bus này
export function BusSenders({ busArn }: { busArn: string }) {
  const integrations = useIntegrationsService();
  const senders = useQuery({
    queryKey: [EVENTBRIDGE_QUERY_ROOT, "senders", busArn],
    queryFn: () => integrations.listBusSenders(busArn),
    enabled: Boolean(busArn),
  });
  return (
    <SendersTable
      rows={senders.data ?? []}
      title='Event senders'
      description='Services sending events to this bus. Add a rule to catch them: source "lambda" for Lambda, "aws.ses" for SES.'
    />
  );
}
