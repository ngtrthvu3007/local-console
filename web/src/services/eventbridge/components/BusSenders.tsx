import { useQuery } from "@tanstack/react-query";
import { SendersTable } from "../../integrations/components/SendersTable.tsx";
import { useLambda } from "../../lambda/hooks/useLambda.ts";
import { useSES } from "../../ses/hooks/useSES.ts";
import { listBusSenders } from "../busSenders.ts";
import { EVENTBRIDGE_QUERY_ROOT } from "../hooks/useBuses.ts";

// Lambda (đích async) và configuration set của SES đang gửi event vào bus này
export function BusSenders({ busArn }: { busArn: string }) {
  const { lambda } = useLambda();
  const ses = useSES();
  const senders = useQuery({
    queryKey: [EVENTBRIDGE_QUERY_ROOT, "senders", busArn],
    queryFn: () => listBusSenders(lambda, ses, busArn),
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
