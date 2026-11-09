import { SERVICE_ICON_SIZE_PX } from "../constants.ts";

// Icon đặt ở web/public/icons
export const ServiceIcon = ({ src }: { src: string }) => (
  <img src={src} alt='' width={SERVICE_ICON_SIZE_PX} height={SERVICE_ICON_SIZE_PX} />
);
