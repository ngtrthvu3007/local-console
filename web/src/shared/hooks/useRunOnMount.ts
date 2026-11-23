import { useEffect, useRef } from "react";

// StrictMode chạy effect 2 lần: poll SQS / peek RabbitMQ lần đầu sẽ giữ mất message
export function useRunOnMount(run: () => void) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, [run]);
}
