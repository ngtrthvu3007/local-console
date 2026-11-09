import { useSyncExternalStore } from "react";

// Store nhỏ dùng chung giữa các trang và Layout (thông báo, breadcrumb)
export function createStore<T>(initialValue: T) {
  let value = initialValue;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    get: () => value,
    set(nextValue: T) {
      value = nextValue;
      listeners.forEach((listener) => listener());
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  };
}
