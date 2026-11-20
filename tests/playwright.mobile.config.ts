import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "mobile",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: "results/playwright/mobile",
  reporter: [["list"]],
  use: {
    baseURL: process.env.LOCAL_CONSOLE_URL ?? "http://127.0.0.1:5173",
    browserName: "chromium",
    launchOptions: { executablePath: process.env.CHROME_PATH },
    // Tắt motion của console (fade, trượt, smooth scroll) để đo vị trí và chụp ảnh ổn định
    contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
