import { useEffect, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import AppLayout, { type AppLayoutProps } from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import SplitPanel from "@cloudscape-design/components/split-panel";
import TopNavigation, {
  type TopNavigationProps,
} from "@cloudscape-design/components/top-navigation";
import {
  APP_NAME,
  FLASHBAR_STACK_THRESHOLD,
  HOME_PATH,
  LOADING_PLACEHOLDER,
  LOGO_PATH,
  PHONE_MAX_WIDTH_PX,
  REGION_LABELS,
  SPLIT_PANEL_PHONE_HEIGHT_RATIO,
  SPLIT_PANEL_SIDE_WIDTH_PX,
} from "./constants.ts";
import { PageSpinner } from "./components/PageState.tsx";
import { FlociDown, ServerDown } from "./components/Unavailable.tsx";
import { useBreadcrumbItems } from "./hooks/useBreadcrumbs.ts";
import { useConfig } from "./hooks/useConfig.ts";
import { useFlociStatus, type FlociState } from "./hooks/useFlociStatus.ts";
import { useFollow } from "./hooks/useFollow.ts";
import { useNotifications } from "./hooks/useNotify.ts";
import { useSideNavigation } from "./hooks/useSideNavigation.ts";
import { useSplitPanelContent } from "./hooks/useSplitPanel.ts";
import "./Layout.css";

const TOP_NAVIGATION_ID = "top-nav";
const TOP_NAVIGATION_LAYER = 1002; // nằm trên AppLayout của Cloudscape
const topNavigationStyle = { position: "sticky", top: 0, zIndex: TOP_NAVIGATION_LAYER } as const;

const FLOCI_LABELS: Record<FlociState, string> = {
  checking: "Floci",
  running: "Floci · Running",
  down: "Floci · Unreachable",
};

const regionLabel = (region: string) => REGION_LABELS[region] ?? region;

// Thanh mảnh dưới thanh trên cùng khi đang tải dữ liệu lần đầu hoặc đang lưu / xóa.
// Bỏ qua refetch nền (auto refresh, kiểm tra Floci 10 giây một lần): query đó đã có dữ liệu
function LoadingBar() {
  const loading =
    useIsFetching({ predicate: (query) => query.state.status === "pending" }) + useIsMutating() > 0;
  return <div className='console-loading-bar' data-active={loading || undefined} aria-hidden />;
}

// Điện thoại: panel nằm dưới, cao 2/3 màn hình. Desktop: panel bên phải
const defaultPanelSize = () =>
  window.innerWidth <= PHONE_MAX_WIDTH_PX
    ? Math.round(window.innerHeight * SPLIT_PANEL_PHONE_HEIGHT_RATIO)
    : SPLIT_PANEL_SIDE_WIDTH_PX;

export function Layout({ children }: { children?: ReactNode }) {
  const follow = useFollow();
  const navigation = useSideNavigation();
  const { pathname } = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(
    () => window.innerWidth > PHONE_MAX_WIDTH_PX,
  );
  useEffect(() => {
    if (window.innerWidth <= PHONE_MAX_WIDTH_PX) setNavigationOpen(false);
  }, [pathname]);
  const floci = useFlociStatus();
  const configQuery = useConfig();
  const config = configQuery.data;
  const breadcrumbs = useBreadcrumbItems();
  const messages = useNotifications();
  const panel = useSplitPanelContent();
  const [panelSize, setPanelSize] = useState(defaultPanelSize);
  const [panelPreferences, setPanelPreferences] = useState<AppLayoutProps.SplitPanelPreferences>({
    position: "side",
  });
  const down = floci.state === "down";

  const identity: TopNavigationProps.Identity = {
    href: HOME_PATH,
    title: APP_NAME,
    logo: { src: LOGO_PATH, alt: "" },
    onFollow: (event) => follow(event, HOME_PATH),
  };

  const utilities: TopNavigationProps.Utility[] = [
    {
      type: "button",
      text: floci.version ? `Floci ${floci.version} · Running` : FLOCI_LABELS[floci.state],
      iconName: down ? "status-negative" : "status-positive",
      href: HOME_PATH,
      onFollow: follow,
    },
    {
      type: "button",
      text: config ? regionLabel(config.region) : LOADING_PLACEHOLDER,
      iconName: "globe",
      disableUtilityCollapse: false,
    },
  ];

  const sideNavigation = (
    <SideNavigation
      items={navigation.items}
      activeHref={navigation.activeHref}
      onFollow={(event) => {
        follow(event);
        if (window.innerWidth <= PHONE_MAX_WIDTH_PX) setNavigationOpen(false);
      }}
    />
  );

  const breadcrumbGroup = breadcrumbs.length > 0 && (
    <BreadcrumbGroup
      items={[{ text: APP_NAME, href: HOME_PATH }, ...breadcrumbs]}
      onFollow={follow}
    />
  );

  const notifications = messages.length > 0 && (
    <Flashbar items={messages} stackItems={messages.length > FLASHBAR_STACK_THRESHOLD} />
  );

  // Panel luôn mở khi trang có nội dung panel; đóng (✕) thì trang tự gỡ nội dung
  const splitPanel = panel && (
    <SplitPanel header={panel.header} headerDescription={panel.description}>
      {panel.body}
    </SplitPanel>
  );

  // Server hoặc Floci không chạy thì thay nội dung bằng trang hướng dẫn chạy lại. Home vẫn hiện:
  // nó tự báo trạng thái Floci. Trang cũ chỉ bị ẩn (không unmount) để code / form đang sửa không mất
  const serverDown = configQuery.isError || floci.serverDown;
  const unavailable = serverDown ? (
    <ServerDown
      checking={configQuery.isFetching || floci.checking}
      onCheck={() => {
        configQuery.refetch();
        floci.refresh();
      }}
    />
  ) : down && pathname !== HOME_PATH ? (
    <FlociDown endpoint={floci.endpoint} checking={floci.checking} onCheck={floci.refresh} />
  ) : null;
  // Mọi trang cần config (region, endpoint) nên chờ có rồi mới render
  const page = config && <div hidden={Boolean(unavailable)}>{children ?? <Outlet />}</div>;
  const content = (
    <>
      {unavailable}
      {page || (!unavailable && <PageSpinner logo />)}
    </>
  );

  return (
    <div className='local-console'>
      <div id={TOP_NAVIGATION_ID} style={topNavigationStyle}>
        <TopNavigation identity={identity} utilities={utilities} />
        <LoadingBar />
      </div>
      <AppLayout
        headerSelector={`#${TOP_NAVIGATION_ID}`}
        toolsHide
        navigation={sideNavigation}
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        breadcrumbs={breadcrumbGroup}
        notifications={notifications}
        content={content}
        splitPanel={splitPanel}
        splitPanelOpen={Boolean(panel)}
        onSplitPanelToggle={({ detail }) => !detail.open && panel?.onClose()}
        splitPanelSize={panelSize}
        onSplitPanelResize={({ detail }) => setPanelSize(detail.size)}
        splitPanelPreferences={panelPreferences}
        onSplitPanelPreferencesChange={({ detail }) => setPanelPreferences(detail)}
      />
    </div>
  );
}
