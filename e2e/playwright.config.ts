import { defineConfig } from "@playwright/test";

const apiEnv = {
  DATABASE_URL: "file:./e2e.db",
  ALIYUN_OSS_REGION: process.env.ALIYUN_OSS_REGION ?? "oss-cn-hangzhou",
  ALIYUN_OSS_BUCKET: process.env.ALIYUN_OSS_BUCKET ?? "galleria-principii-media",
};

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: "./global-setup.ts",

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 } },
    },
  ],

  webServer: [
    {
      command: "npm run dev --workspace @galleria-principii/api",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: apiEnv,
    },
    {
      command: "npm run dev --workspace @galleria-principii/web",
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
