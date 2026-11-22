import Button from "@cloudscape-design/components/button";
import ButtonDropdown, {
  type ButtonDropdownProps,
} from "@cloudscape-design/components/button-dropdown";
import type { IconProps } from "@cloudscape-design/components/icon";
import { ResponsiveActions } from "./ResponsiveActions.tsx";
import { useFollow } from "../hooks/useFollow.ts";

export interface BarAction {
  id: string;
  text: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  disabledReason?: string; // lý do khóa, hiện khi rê / focus vào nút
  loading?: boolean;
  iconName?: IconProps.Name;
  iconOnly?: boolean; // chỉ hiện icon, text làm aria-label
  primary?: boolean; // nút chính, luôn đứng cuối
  quiet?: boolean; // nút chính nhưng kiểu thường, khi trang đã có nút chính khác (vd: Run của form tìm)
  pinned?: boolean; // khung hẹp vẫn là nút riêng, trừ khi có split button để gộp vào
}

interface Props {
  actions: BarAction[];
  // Mục luôn nằm trong dropdown (vd: copy, move, rename)
  menuItems?: ButtonDropdownProps.Item[];
  onMenuItemClick?: (id: string) => void;
  compact: boolean;
}

const MENU_TEXT = "Actions";
const MORE_ACTIONS_LABEL = "More actions";

interface RefetchableQuery {
  isFetching: boolean;
  refetch: () => unknown;
}

// Nút làm mới chỉ có icon; khung hẹp có nút chính thì vào menu ▾
export const refreshAction = (query: RefetchableQuery): BarAction => ({
  id: "refresh",
  text: "Refresh",
  iconName: "refresh",
  iconOnly: true,
  pinned: true,
  loading: query.isFetching,
  onClick: () => query.refetch(),
});

const toMenuItem = (action: BarAction): ButtonDropdownProps.Item => ({
  id: action.id,
  text: action.text,
  disabled: action.disabled || action.loading,
  disabledReason: action.disabledReason,
  href: action.href,
  iconName: action.iconName,
});

// Khung rộng: mỗi action là một nút + dropdown "Actions".
// Khung hẹp: một split button [nút chính | ▾] chứa mọi action còn lại, kể cả Refresh,
// để header nằm gọn một hàng cạnh tiêu đề. Không có nút chính thì nút ghim vẫn đứng riêng.
export function ActionBar({ actions, menuItems = [], onMenuItemClick, compact }: Props) {
  const follow = useFollow();
  const primary = actions.find((action) => action.primary);
  const secondary = actions.filter((action) => !action.primary);
  const folded = compact ? secondary.filter((action) => primary || !action.pinned) : [];
  const visibleSecondary = secondary.filter((action) => !folded.includes(action));
  const dropdownItems = [...folded.map(toMenuItem), ...menuItems];

  const runItem = (id: string) => {
    const action = folded.find((candidate) => candidate.id === id);
    if (action) {
      if (!action.disabled && !action.loading) action.onClick?.();
      return;
    }
    onMenuItemClick?.(id);
  };

  const renderButton = (action: BarAction) => (
    <Button
      key={action.id}
      variant={action.primary && !action.quiet ? "primary" : "normal"}
      iconName={action.iconName}
      ariaLabel={action.iconOnly ? action.text : undefined}
      disabled={action.disabled}
      disabledReason={action.disabledReason}
      loading={action.loading}
      href={action.href}
      onFollow={follow}
      onClick={action.onClick}
    >
      {action.iconOnly ? undefined : action.text}
    </Button>
  );

  const onItemClick: ButtonDropdownProps["onItemClick"] = ({ detail }) => runItem(detail.id);

  const splitButton = primary && dropdownItems.length > 0 && (
    <ButtonDropdown
      variant={primary.quiet ? "normal" : "primary"}
      loading={primary.loading}
      ariaLabel={MORE_ACTIONS_LABEL}
      items={dropdownItems}
      onItemClick={onItemClick}
      onItemFollow={follow}
      mainAction={{
        text: primary.text,
        iconName: primary.iconName,
        href: primary.href,
        disabled: primary.disabled,
        disabledReason: primary.disabledReason,
        onFollow: follow,
        onClick: primary.onClick,
      }}
    />
  );

  const menuDropdown = dropdownItems.length > 0 && (
    <ButtonDropdown items={dropdownItems} onItemClick={onItemClick} onItemFollow={follow}>
      {MENU_TEXT}
    </ButtonDropdown>
  );

  if (compact && splitButton) {
    return (
      <ResponsiveActions toolbar>{splitButton}</ResponsiveActions>
    );
  }

  return (
    <ResponsiveActions toolbar={compact}>
      {visibleSecondary.map(renderButton)}
      {menuDropdown}
      {primary && renderButton(primary)}
    </ResponsiveActions>
  );
}
