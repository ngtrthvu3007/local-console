import Link from "@cloudscape-design/components/link";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { localUrl } from "../distributions.ts";

// URL local của distribution, mở tab mới (danh sách distribution, khối ở trang bucket)
export function LocalUrlLink({ id }: { id: string }) {
  const url = localUrl(useLoadedConfig().flociPublicUrl, id);
  return (
    <Link href={url} external>
      {url}
    </Link>
  );
}
