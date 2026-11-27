import { useRef } from "react";

// Form kiểm tra bất đồng bộ nên isPending chưa kịp bật khi lần bấm thứ hai tới: không chặn thì bấm đúp
// tạo hai resource (đã gặp ở E2E Launch instance của EC2)
export function useSubmitOnce(submit: () => Promise<unknown>) {
  const submitting = useRef(false);

  return async () => {
    if (submitting.current) return;
    submitting.current = true;

    try {
      await submit();
    } finally {
      submitting.current = false;
    }
  };
}
