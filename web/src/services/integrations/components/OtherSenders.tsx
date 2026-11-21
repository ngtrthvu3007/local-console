import { useQuery } from "@tanstack/react-query";
import { useLambda } from "../../lambda/hooks/useLambda.ts";
import { useS3 } from "../../s3/hooks/useS3.ts";
import { useSES } from "../../ses/hooks/useSES.ts";
import { listSenders, type SenderKind } from "../senders.ts";
import { SendersTable } from "./SendersTable.tsx";

interface Props {
  arn: string;
  // Nguồn quét được tuỳ loại resource (queue / topic / function)
  kinds: readonly SenderKind[];
}

// S3, Lambda và SES đang gửi vào resource này qua cấu hình ở trang của chúng
export function OtherSenders({ arn, kinds }: Props) {
  const { s3 } = useS3();
  const { lambda } = useLambda();
  const ses = useSES();
  const senders = useQuery({
    queryKey: ["senders", arn, ...kinds],
    queryFn: () => listSenders({ s3, lambda, ses }, arn, kinds),
  });
  return (
    <SendersTable
      rows={senders.data ?? []}
      title='Other senders'
      description='S3, Lambda and SES settings that send here.'
    />
  );
}
