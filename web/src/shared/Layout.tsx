import { useState } from "react";
import { Outlet } from "react-router";
import AppLayout, { type AppLayoutProps } from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import SplitPanel from "@cloudscape-design/components/split-panel";
import Spinner from "@cloudscape-design/components/spinner";
import TopNavigation, {
  type TopNavigationProps,
} from "@cloudscape-design/components/top-navigation";
import {
  APP_NAME,
  FLASHBAR_STACK_THRESHOLD,
  FLOCI_START_COMMAND,
  HOME_PATH,
  LOADING_PLACEHOLDER,
  LOGO_PATH,
  PHONE_MAX_WIDTH_PX,
  REGION_LABELS,
  SPLIT_PANEL_PHONE_HEIGHT_RATIO,
  SPLIT_PANEL_SIDE_WIDTH_PX,
} from "./constants.ts";
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

// Điện thoại: panel nằm dưới, cao 2/3 màn hình. Desktop: panel bên phải
const defaultPanelSize = () =>
  window.innerWidth <= PHONE_MAX_WIDTH_PX
    ? Math.round(window.innerHeight * SPLIT_PANEL_PHONE_HEIGHT_RATIO)
    : SPLIT_PANEL_SIDE_WIDTH_PX;

export function Layout() {
  const follow = useFollow();
  const navigation = useSideNavigation();
  const floci = useFlociStatus();
  const { data: config } = useConfig();
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
      disableUtilityCollapse: true,
    },
  ];

  const flociDownMessage: FlashbarProps.MessageDefinition = {
    id: "floci-down",
    type: "error",
    header: `Cannot reach Floci at ${floci.endpoint}`,
    content: `${floci.error || "No response"} — start it with: ${FLOCI_START_COMMAND}`,
  };
  const flashMessages = down ? [flociDownMessage, ...messages] : messages;

  const sideNavigation = (
    <SideNavigation items={navigation.items} activeHref={navigation.activeHref} onFollow={follow} />
  );

  const breadcrumbGroup = breadcrumbs.length > 0 && (
    <BreadcrumbGroup
      items={[{ text: APP_NAME, href: HOME_PATH }, ...breadcrumbs]}
      onFollow={follow}
    />
  );

  const notifications = flashMessages.length > 0 && (
    <Flashbar items={flashMessages} stackItems={flashMessages.length > FLASHBAR_STACK_THRESHOLD} />
  );

  // Panel luôn mở khi trang có nội dung panel; đóng (✕) thì trang tự gỡ nội dung
  const splitPanel = panel && (
    <SplitPanel header={panel.header} headerDescription={panel.description}>
      {panel.body}
    </SplitPanel>
  );

  // Mọi trang cần config (region, endpoint) nên chờ có rồi mới render
  const content = config ? <Outlet /> : <Spinner size='large' />;

  return (
    <>
      <div id={TOP_NAVIGATION_ID} style={topNavigationStyle}>
        <TopNavigation identity={identity} utilities={utilities} />
      </div>
      <AppLayout
        headerSelector={`#${TOP_NAVIGATION_ID}`}
        toolsHide
        navigation={sideNavigation}
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
    </>
  );
}
