// Tab đang mở nằm trên URL (?tab=) để reload / chia sẻ link vẫn đúng tab
export const TAB_PARAM = "tab";

export function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return params.size ? `${path}?${params}` : path;
}

export const withTab = (path: string, tab: string | undefined, defaultTab: string) =>
  withQuery(path, { [TAB_PARAM]: tab === defaultTab ? undefined : tab });

// react-router (encodePathParam) trả lại các ký tự này sau encodeURIComponent; làm giống để
// link core dựng (MCP) trùng link UI dựng bằng generatePath
const UNESCAPED_IN_PATH = /%(?:24|26|2B|2C|3A|3B|3D|40)/g;
const PATH_PARAM = /^:([\w-]+)$/;
const PATH_SEPARATOR = "/";

const encodePathParam = (value: string) =>
  encodeURIComponent(value).replace(UNESCAPED_IN_PATH, decodeURIComponent);

// Như generatePath của react-router, chỉ cho segment ":param" (route của console chỉ dùng dạng này)
export const fillPath = (pattern: string, params: Record<string, string>) =>
  pattern
    .split(PATH_SEPARATOR)
    .map((segment) => {
      const key = segment.match(PATH_PARAM)?.[1];
      return key === undefined ? segment : encodePathParam(params[key]);
    })
    .join(PATH_SEPARATOR);
