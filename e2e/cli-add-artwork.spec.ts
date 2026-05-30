import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const apiDir = resolve(repoRoot, "apps/api");
const manifestPath = resolve(here, "fixtures/cli/manifest.json");

const cliEnv = {
  ...process.env,
  DATABASE_URL: "file:./e2e.db",
  ALIYUN_OSS_REGION: process.env.ALIYUN_OSS_REGION ?? "oss-cn-hangzhou",
  ALIYUN_OSS_BUCKET: process.env.ALIYUN_OSS_BUCKET ?? "galleria-principii-media",
  OSS_UPLOADER_STUB: "1",
};

function runCli(): string {
  return execSync(
    `npx tsx src/cli/addArtwork.ts "${manifestPath}"`,
    { cwd: apiDir, env: cliEnv, stdio: "pipe" }
  ).toString();
}

function resetDb(): void {
  execSync("npx tsx prisma/seed.ts", {
    cwd: apiDir,
    env: cliEnv,
    stdio: "pipe",
  });
}

test.describe("add-artwork CLI -> gallery", () => {
  test.afterEach(() => {
    resetDb();
  });

  test("running the CLI adds the artwork and it becomes visible in the gallery", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Harbour Lanterns at Slack Water/i })
    ).toHaveCount(0);

    const output = runCli();
    expect(output).toContain("UPSERTED");
    expect(output).toContain("OK");

    await page.reload();
    await expect(
      page.getByRole("button", { name: /Harbour Lanterns at Slack Water/i })
    ).toBeVisible();
  });
});
