import { defineConfig } from "vitest/config";

// IT chạy kiểu hộp đen vào console đang chạy (docker-compose.yml cạnh file này)
export default defineConfig({
  test: {
    include: ["it/**/*.test.ts"],
    environment: "node",
    // Redis / RabbitMQ / Lambda do Floci bật container mới, mất vài chục giây
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Chạy lần lượt để không bật cùng lúc nhiều container trên Docker
    fileParallelism: false,
  },
});
