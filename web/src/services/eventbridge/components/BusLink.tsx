import Link from "@cloudscape-design/components/link";
import { MissingReference } from "@shared/components/MissingReference.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useBuses } from "../hooks/useBuses.ts";
import { eventbridgeRoutes } from "../routes.ts";

// Tên bus thành link sang các rule của bus; bus đã bị xóa mà schedule / rule còn trỏ tới thì báo
// "not found" (so với danh sách bus đã tải, vì bus không có trang chi tiết để dò)
export function BusLink({ name }: { name: string }) {
  const follow = useFollow();
  const buses = useBuses().data;
  if (buses && !buses.some((bus) => bus.name === name)) return <MissingReference name={name} />;
  return (
    <Link href={eventbridgeRoutes.rules(name)} onFollow={follow}>
      {name}
    </Link>
  );
}
