import Button from "@cloudscape-design/components/button";
import ButtonDropdown, {
  type ButtonDropdownProps,
} from "@cloudscape-design/components/button-dropdown";
import type { IconProps } from "@cloudscape-design/components/icon";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useFollow } from "../hooks/useFollow.ts";

export interface BarAction {
  id: string;
  text: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  iconName?: IconProps.Name;
  iconOnly?: boolean; // chỉ hiện icon, text làm aria-label
  primary?: boolean; // nút chính, luôn đứng cuối
  pinned?: boolean; // luôn là nút riêng, kể cả khi khung hẹp
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

// Nút làm mới chỉ có icon, luôn nằm ngoài dropdown
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
  disabled: action.disabled,
  iconName: action.iconName,
});

// Khung rộng: mỗi action là một nút + dropdown "Actions".
// Khung hẹp: nút ghim + một split button [nút chính | ▾] chứa mọi action còn lại.
export function ActionBar({ actions, menuItems = [], onMenuItemClick, compact }: Props) {
  const follow = useFollow();
  const primary = actions.find((action) => action.primary);
  const secondary = actions.filter((action) => !action.primary);
  const pinned = secondary.filter((action) => action.pinned);
  const folded = compact ? secondary.filter((action) => !action.pinned) : [];
  const visibleSecondary = compact ? pinned : secondary;
  const dropdownItems = [...folded.map(toMenuItem), ...menuItems];

  const runItem = (id: string) => {
    const action = folded.find((candidate) => candidate.id === id);
    if (action) action.onClick?.();
    else onMenuItemClick?.(id);
  };

  const renderButton = (action: BarAction) => (
    <Button
      key={action.id}
      variant={action.primary ? "primary" : "normal"}
      iconName={action.iconName}
      ariaLabel={action.iconOnly ? action.text : undefined}
      disabled={action.disabled}
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
      variant='primary'
      ariaLabel={MORE_ACTIONS_LABEL}
      items={dropdownItems}
      onItemClick={onItemClick}
      mainAction={{
        text: primary.text,
        iconName: primary.iconName,
        href: primary.href,
        disabled: primary.disabled,
        onFollow: follow,
        onClick: primary.onClick,
      }}
    />
  );

  const menuDropdown = dropdownItems.length > 0 && (
    <ButtonDropdown items={dropdownItems} onItemClick={onItemClick}>
      {MENU_TEXT}
    </ButtonDropdown>
  );

  if (compact && splitButton) {
    return (
      <SpaceBetween direction='horizontal' size='xs'>
        {pinned.map(renderButton)}
        {splitButton}
      </SpaceBetween>
    );
  }

  return (
    <SpaceBetween direction='horizontal' size='xs'>
      {visibleSecondary.map(renderButton)}
      {menuDropdown}
      {primary && renderButton(primary)}
    </SpaceBetween>
  );
}
