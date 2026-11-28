// Tab đang mở nằm trên URL (?tab=) để reload / chia sẻ link vẫn đúng tab
export const TAB_PARAM = "tab";

// Thêm query string, bỏ các giá trị trống
export function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return params.size ? `${path}?${params}` : path;
}

// Tab mặc định không ghi lên URL
export const withTab = (path: string, tab: string | undefined, defaultTab: string) =>
  withQuery(path, { [TAB_PARAM]: tab === defaultTab ? undefined : tab });
