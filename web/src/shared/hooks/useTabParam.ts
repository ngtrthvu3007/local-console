import { useSearchParams } from "react-router";
import { TAB_PARAM } from "@localconsole/core/shared";

// Tab mặc định không ghi lên URL. keep: query param khác của trang giữ lại khi đổi tab (vd: ?key= của KMS)
export function useTabParam<T extends string>(
  tabs: Record<string, T>,
  defaultTab: T,
  keep: readonly string[] = [],
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(TAB_PARAM);
  const tab = Object.values(tabs).find((value) => value === requested) ?? defaultTab;

  const setTab = (next: string) => {
    const params = new URLSearchParams();
    for (const name of keep) {
      const value = searchParams.get(name);
      if (value !== null) params.set(name, value);
    }
    if (next !== defaultTab) params.set(TAB_PARAM, next);
    setSearchParams(params);
  };

  return [tab, setTab] as const;
}
