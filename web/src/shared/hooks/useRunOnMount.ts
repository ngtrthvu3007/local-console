import { useEffect, useRef } from "react";

// Chạy đúng một lần khi mount. StrictMode (dev) chạy effect 2 lần: với việc lấy message
// (poll SQS, peek RabbitMQ) lần đầu giữ/nhận mất message, modal chỉ hiện kết quả rỗng của lần sau.
export function useRunOnMount(run: () => void) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, []);
}
