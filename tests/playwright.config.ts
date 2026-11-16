import { defineConfig, devices } from "@playwright/test";

// E2E + UI/responsive chạy vào console đang chạy (docker-compose.yml cạnh file này)
const baseURL = process.env.LOCAL_CONSOLE_URL ?? "http://localhost:3701";

// Mốc lấy từ code của console: 900px gom nút vào dropdown, 688px là điện thoại của Cloudscape
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1024, height: 768 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 390, height: 844 },
};

export default defineConfig({
  outputDir: "results/playwright",
  reporter: [["list"], ["html", { outputFolder: "results/report", open: "never" }]],
  // Dùng chung một Floci: chạy lần lượt để test không giẫm dữ liệu của nhau
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "e2e", testDir: "e2e", use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.desktop } },
    // Chụp component ở các trạng thái tương tác để review UX (desktop + phone trong cùng spec)
    { name: "ux", testDir: "ux", use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.desktop } },
    ...Object.entries(VIEWPORTS).map(([name, viewport]) => ({
      name: `ui-${name}`,
      testDir: "ui",
      use: { ...devices["Desktop Chrome"], viewport, isMobile: false },
    })),
  ],
});
