import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // 実APIケースは同じ一時SQLiteを使うため順次実行。DB競合はpytest内で明示的に検証。
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-los-angeles",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 960 },
        timezoneId: "America/Los_Angeles",
      },
    },
    {
      name: "mobile-tokyo",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        timezoneId: "Asia/Tokyo",
      },
    },
  ],
  webServer: [{
    command: process.platform === "win32" ? "backend\\.venv\\Scripts\\python.exe backend/run_e2e.py" : "backend/.venv/bin/python backend/run_e2e.py",
    url: "http://127.0.0.1:5001/api/health",
    reuseExistingServer: !process.env.CI,
  }, {
    command: "npm run dev -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    env: { BACKEND_URL: "http://127.0.0.1:5001" },
  }],
});
