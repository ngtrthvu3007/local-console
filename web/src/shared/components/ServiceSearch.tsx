import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Autosuggest, { type AutosuggestProps } from "@cloudscape-design/components/autosuggest";
import { servicePath, services, type ServiceDefinition } from "../../registry.ts";
import { SEARCH_SHORTCUT_KEY } from "../constants.ts";
import { matchServices, RECENT_SERVICES_TITLE, useRecentServices } from "../recentServices.ts";
import { ServiceIcon } from "./ServiceIcon.tsx";

const SEARCH_LABEL = "Search services";
const NO_MATCH_TEXT = "No matching services";

// Không kèm mô tả: Cloudscape tô chữ khớp cả trong mô tả, mà search chỉ khớp
// tên service
const toOption = (service: ServiceDefinition): AutosuggestProps.Option => ({
  value: servicePath(service),
  label: service.fullName,
  iconSvg: <ServiceIcon service={service} />,
});

// Đang gõ trong ô nhập (filter, form, editor Ace dùng textarea) thì "/" là ký
// tự, không phải phím tắt
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.matches("input, textarea, select") || target.isContentEditable);

export function ServiceSearch() {
  const navigate = useNavigate();
  const recent = useRecentServices();
  const [value, setValue] = useState("");
  const ref = useRef<AutosuggestProps.Ref>(null);

  useEffect(() => {
    const focusOnShortcut = (event: KeyboardEvent) => {
      if (
        event.key !== SEARCH_SHORTCUT_KEY ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      )
        return;

      event.preventDefault();
      ref.current?.focus();
    };

    document.addEventListener("keydown", focusOnShortcut);
    return () => document.removeEventListener("keydown", focusOnShortcut);
  }, []);

  // Nhóm trống (chưa có lịch sử, hoặc không khớp) thì không hiện
  const groups = [
    { label: RECENT_SERVICES_TITLE, members: recent },
    { label: "All services", members: services },
  ]
    .map(({ label, members }) => ({
      label,
      options: matchServices(members, value).map(toOption),
    }))
    .filter(({ options }) => options.length > 0);

  // Enter khi không có mục nào đang sáng thì mở kết quả đầu tiên; ô trống hoặc
  // không khớp thì thôi
  const onSelect = ({ detail }: { detail: AutosuggestProps.SelectDetail }) => {
    const firstMatch = value.trim() ? groups[0]?.options[0]?.value : undefined;
    const path = detail.selectedOption?.value ?? firstMatch;
    if (!path) return;
    setValue("");

    // Rời ô search: gõ tiếp (kể cả "/") thuộc về trang vừa mở
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    navigate(path, { viewTransition: true });
  };

  return (
    <Autosuggest
      ref={ref}
      value={value}
      onChange={({ detail }) => setValue(detail.value)}
      onSelect={onSelect}
      options={groups}
      filteringType='manual'
      hideEnteredTextOption
      empty={NO_MATCH_TEXT}
      ariaLabel={SEARCH_LABEL}
      placeholder={`${SEARCH_LABEL} [${SEARCH_SHORTCUT_KEY}]`}
    />
  );
}
