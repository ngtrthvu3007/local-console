import type { ServiceDefinition } from "../../registry.ts";
import { SERVICE_CATEGORIES, SERVICE_GLYPH_SIZE_PX } from "../constants.ts";

// Ô màu theo danh mục (Compute cam, Database xanh…) với glyph trắng; chỉ để trang trí, tên đứng cạnh
export function ServiceIcon({ service }: { service: Pick<ServiceDefinition, "icon" | "category"> }) {
  const { icon: Glyph, category } = service;
  return (
    <span
      className='console-service-icon'
      style={{ background: SERVICE_CATEGORIES[category].color }}
      aria-hidden
    >
      <Glyph size={SERVICE_GLYPH_SIZE_PX} />
    </span>
  );
}
