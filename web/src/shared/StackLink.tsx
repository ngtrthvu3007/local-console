import Link from "@cloudscape-design/components/link";
import { useResourceIndex } from "../services/cloudformation/hooks/useResourceIndex.ts";
import { cloudformationRoutes } from "@localconsole/core/cloudformation";
import { DETAIL_SEPARATOR } from "@localconsole/core/shared";
import { useFollow } from "./hooks/useFollow.ts";

interface Props {
  type: string; // vd: "AWS::SQS::Queue"
  physicalId: string;
  // Thêm dấu phân cách khi đứng sau mô tả, chỉ khi có stack
  separated?: boolean;
}

// Không thuộc stack nào (hoặc đang tải, lỗi) thì không hiện gì
export function StackLink({ type, physicalId, separated }: Props) {
  const follow = useFollow();
  const stack = useResourceIndex().data?.(type, physicalId);
  if (!stack) return null;
  return (
    <span>
      {separated && DETAIL_SEPARATOR}Stack:{" "}
      <Link href={cloudformationRoutes.stack(stack)} onFollow={follow}>
        {stack}
      </Link>
    </span>
  );
}
