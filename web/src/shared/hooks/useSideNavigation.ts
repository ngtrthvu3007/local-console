import { createElement } from "react";
import { useLocation } from "react-router";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import { servicePath, services, type ServiceDefinition } from "../../registry.ts";
import { ServiceIcon } from "../components/ServiceIcon.tsx";
import { HOME_PATH } from "../constants.ts";

const isWithin = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

// Service chỉ có 1 trang thì là link thẳng; từ 2 trang trở lên mới là nhóm thu gọn được
function serviceItem(
  service: ServiceDefinition,
): SideNavigationProps.Link | SideNavigationProps.ExpandableLinkGroup {
  const icon = createElement(ServiceIcon, { src: service.iconPath });
  const [onlyPage, ...otherPages] = service.navigation;
  if (onlyPage && !otherPages.length) {
    return { type: "link", text: service.name, href: onlyPage.href, icon };
  }
  return {
    type: "expandable-link-group",
    text: service.name,
    href: servicePath(service),
    icon,
    defaultExpanded: true,
    items: service.navigation.map((link) => ({ type: "link", text: link.text, href: link.href })),
  };
}

const NAVIGATION_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Console Home", href: HOME_PATH },
  { type: "divider" },
  { type: "section-group", title: "Services", items: services.map(serviceItem) },
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
