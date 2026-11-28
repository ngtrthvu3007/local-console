import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useBuses } from "../hooks/useBuses.ts";
import { eventbridgeRoutes } from "../routes.ts";

// Bus không có trang chi tiết để dò nên so với danh sách bus đã tải để báo "not found"
export function BusLink({ name }: { name: string }) {
  const buses = useBuses().data;
  const missing = buses !== undefined && !buses.some((bus) => bus.name === name);
  return <ReferenceLink name={name} href={eventbridgeRoutes.rules(name)} missing={missing} />;
}
