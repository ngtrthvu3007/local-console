import { createElement } from "react";
import { useLocation } from "react-router";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import { servicePath, services, type ServiceDefinition } from "../../registry.ts";
import { ServiceIcon } from "../components/ServiceIcon.tsx";
import { HOME_PATH, SERVICE_CATEGORIES, type ServiceCategory } from "../constants.ts";

const isWithin = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

// Service chỉ có 1 trang thì là link thẳng; từ 2 trang trở lên mới là nhóm thu gọn được
function serviceItem(
  service: ServiceDefinition,
): SideNavigationProps.Link | SideNavigationProps.ExpandableLinkGroup {
  const icon = createElement(ServiceIcon, { service });
  const [onlyPage, ...otherPages] = service.navigation;
  if (onlyPage && !otherPages.length) {
    return { type: "link", text: service.name, href: onlyPage.href, icon };
  }
  // Không đặt defaultExpanded: Cloudscape chỉ mở nhóm chứa trang đang xem, sidebar không dài ra
  return {
    type: "expandable-link-group",
    text: service.name,
    href: servicePath(service),
    icon,
    items: service.navigation.map((link) => ({ type: "link", text: link.text, href: link.href })),
  };
}

// Nhóm theo danh mục như AWS console; danh mục chưa có service thì không hiện
const categoryGroups = (Object.keys(SERVICE_CATEGORIES) as ServiceCategory[])
  .map((category) => ({
    category,
    members: services.filter((service) => service.category === category),
  }))
  .filter(({ members }) => members.length > 0)
  .map(
    ({ category, members }): SideNavigationProps.SectionGroup => ({
      type: "section-group",
      title: SERVICE_CATEGORIES[category].label,
      items: members.map(serviceItem),
    }),
  );

const NAVIGATION_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Console Home", href: HOME_PATH },
  { type: "divider" },
  ...categoryGroups,
];

const NAVIGABLE_PATHS = [
  HOME_PATH,
  ...services.flatMap((service) => [
    servicePath(service),
    ...service.navigation.map((link) => link.href),
  ]),
];

const byLongestFirst = (left: string, right: string) => right.length - left.length;

export function useSideNavigation() {
  const { pathname } = useLocation();
  // Khớp đường dẫn dài nhất: /s3/buckets/x vẫn sáng mục của S3
  const activeHref =
    NAVIGABLE_PATHS.filter((path) => isWithin(pathname, path)).sort(byLongestFirst)[0] ?? HOME_PATH;
  return { items: NAVIGATION_ITEMS, activeHref };
}
