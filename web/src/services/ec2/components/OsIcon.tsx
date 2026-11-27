import type { Image } from "@aws-sdk/client-ec2";
import {
  IconBrandAmazon,
  IconBrandDebian,
  IconBrandRedhat,
  IconBrandUbuntu,
  IconBrandWindows,
  IconTerminal2,
  type Icon,
} from "@tabler/icons-react";
import { SERVICE_GLYPH_SIZE_PX } from "@shared/constants.ts";

interface OsStyle {
  icon: Icon;
  color: string; // màu thương hiệu của OS, làm nền ô icon
}

const GENERIC_OS: OsStyle = { icon: IconTerminal2, color: "#6B7280" };

// Theo thứ tự: rule đầu khớp thì dùng. Tabler chỉ có logo cho 5 OS đầu; Rocky / SUSE / Alpine
// dùng icon chung nhưng khác màu để vẫn phân biệt được
const OS_STYLES: { pattern: RegExp; style: OsStyle }[] = [
  { pattern: /amzn|al2023|amazon/i, style: { icon: IconBrandAmazon, color: "#FF9900" } },
  { pattern: /ubuntu/i, style: { icon: IconBrandUbuntu, color: "#E95420" } },
  { pattern: /debian/i, style: { icon: IconBrandDebian, color: "#A81D33" } },
  { pattern: /windows/i, style: { icon: IconBrandWindows, color: "#0078D4" } },
  { pattern: /rhel|red hat/i, style: { icon: IconBrandRedhat, color: "#EE0000" } },
  { pattern: /rocky/i, style: { ...GENERIC_OS, color: "#10B981" } },
  { pattern: /suse|sles|smlm/i, style: { ...GENERIC_OS, color: "#73BA25" } },
  { pattern: /alpine/i, style: { ...GENERIC_OS, color: "#0D597F" } },
];

export function osStyleOf(image?: Image): OsStyle {
  const text = `${image?.Name ?? ""} ${image?.Description ?? ""}`;
  return OS_STYLES.find(({ pattern }) => pattern.test(text))?.style ?? GENERIC_OS;
}

// Ô màu + glyph trắng, cùng kiểu icon service; chỉ để nhận diện nhanh nên ẩn khỏi screen reader (tên đã có chữ)
export function OsIcon({ image }: { image?: Image }) {
  const { icon: Glyph, color } = osStyleOf(image);

  return (
    <span className='console-service-icon' style={{ background: color }} aria-hidden>
      <Glyph size={SERVICE_GLYPH_SIZE_PX} />
    </span>
  );
}
