import { useEffect, useState } from "react";
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import { readStorage, writeStorage } from "./storage.ts";

// Giao diện sáng / tối: mặc định theo hệ điều hành, người dùng chọn khác thì
// nhớ trong trình duyệt
export const COLOR_PREFERENCE_IDS = ["system", "light", "dark"] as const;
type ColorPreference = (typeof COLOR_PREFERENCE_IDS)[number];

export const COLOR_PREFERENCES: Record<ColorPreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const STORAGE_KEY = "localconsole:color-mode";
const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export const isColorPreference = (value: string | null): value is ColorPreference =>
  COLOR_PREFERENCE_IDS.some((id) => id === value);

// Chưa chọn (hoặc storage bị chặn) thì theo hệ điều hành
export function readColorPreference(): ColorPreference {
  const stored = readStorage(STORAGE_KEY);
  return isColorPreference(stored) ? stored : "system";
}

const systemPrefersDark = () => window.matchMedia(DARK_SCHEME_QUERY).matches;

// Gọi một lần trước khi render (main.tsx) để trang không nháy sáng rồi mới tối
export function applyColorPreference(preference: ColorPreference) {
  const dark = preference === "dark" || (preference === "system" && systemPrefersDark());
  applyMode(dark ? Mode.Dark : Mode.Light);
}

export function useColorPreference() {
  const [preference, setPreference] = useState(readColorPreference);

  useEffect(() => {
    applyColorPreference(preference);
    if (preference !== "system") return;
    // Theo hệ điều hành: đổi giao diện máy thì console đổi theo ngay
    const media = window.matchMedia(DARK_SCHEME_QUERY);
    const follow = () => applyColorPreference("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);

  const change = (next: ColorPreference) => {
    writeStorage(STORAGE_KEY, next);
    setPreference(next);
  };

  return [preference, change] as const;
}
