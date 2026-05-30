import { test, expect } from "@playwright/test";

test.describe("Gallery MVP", () => {
  test("gallery loads with heading and known artwork", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Galleria Principii/i })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Study of Ophelia Among the Reeds/i })
    ).toBeVisible();
  });

  test('search "rose" returns artworks that match across title, description, and media metadata', async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Study of Ophelia Among the Reeds/i })
    ).toBeVisible();

    const search = page.getByRole("searchbox", {
      name: /search/i,
    });
    await search.fill("rose");

    await expect(
      page.getByRole("button", { name: /Morning at the Rose Window/i })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Foundry at Dusk/i })
    ).toHaveCount(0);
  });

  test('search "zzzz-no-match" shows "No artworks found"', async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Study of Ophelia Among the Reeds/i })
    ).toBeVisible();

    const search = page.getByRole("searchbox", {
      name: /search/i,
    });
    await search.fill("zzzz-no-match");

    await expect(
      page.getByText(/No artworks found/i)
    ).toBeVisible();
  });

  test("detail view for known artwork shows description, medium, and soundtrack caption", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .getByRole("button", { name: /Study of Ophelia Among the Reeds/i })
      .click();

    const dialog = page.getByRole("dialog", {
      name: /Study of Ophelia Among the Reeds/i,
    });

    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", {
        name: /Study of Ophelia Among the Reeds/i,
      })
    ).toBeVisible();
    await expect(
      dialog.getByText(
        /Ophelia rests among reeds and water roses, rendered with jewel-toned botanical detail/i
      )
    ).toBeVisible();
    await expect(dialog.getByText("Oil on panel")).toBeVisible();
    // The soundtrack caption is rendered whether the audio asset is signed
    // (offline-mode CI) or unavailable (no OSS credentials in the test env).
    await expect(dialog.getByText("Pianoforte theme")).toBeVisible();
  });

  test("detail dialog remains reachable and contains scrolling in a short viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 360 });
    await page.goto("/");

    await page
      .getByRole("button", { name: /Study of Ophelia Among the Reeds/i })
      .click();

    const dialog = page.getByRole("dialog", {
      name: /Study of Ophelia Among the Reeds/i,
    });
    await expect(dialog).toBeVisible();

    const frame = dialog.locator(".detail-frame");
    await expect(frame).toBeVisible();

    const modalMetrics = await dialog.evaluate((element) => {
      const frameElement = element.querySelector(".detail-frame");
      if (!(frameElement instanceof HTMLElement)) {
        throw new Error("detail frame not found");
      }

      const rect = element.getBoundingClientRect();
      const frameRect = frameElement.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        frameHeight: frameRect.height,
        bodyOverflow: getComputedStyle(document.body).overflow,
        documentOverflow: getComputedStyle(document.documentElement).overflow,
      };
    });

    expect(modalMetrics.top).toBeGreaterThanOrEqual(0);
    expect(modalMetrics.bottom).toBeLessThanOrEqual(360);
    expect(modalMetrics.scrollHeight).toBeGreaterThan(modalMetrics.clientHeight);
    expect(modalMetrics.frameHeight).toBeGreaterThan(modalMetrics.clientHeight);
    expect([modalMetrics.bodyOverflow, modalMetrics.documentOverflow]).toContain("hidden");

    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    const frameTopBefore = await frame.evaluate((element) => element.getBoundingClientRect().top);
    await dialog.hover();
    await page.mouse.wheel(0, 700);

    await expect.poll(async () => dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect.poll(async () => frame.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(frameTopBefore);
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
  });

  test("OSS credentials never appear in API responses or HTML", async ({
    page,
    request,
  }) => {
    const apiResponse = await request.get("http://localhost:3000/api/artworks");
    expect(apiResponse.ok()).toBe(true);
    const body = await apiResponse.text();
    expect(body).not.toMatch(/ALIBABA_CLOUD_ACCESS_KEY_ID/);
    expect(body).not.toMatch(/ALIBABA_CLOUD_ACCESS_KEY_SECRET/);
    expect(body).not.toMatch(/accessKeySecret/);

    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Study of Ophelia Among the Reeds/i })
    ).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/ALIBABA_CLOUD_ACCESS_KEY_ID/);
    expect(html).not.toMatch(/accessKeySecret/);
  });

  test("mobile viewport has heading/search visible and no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Galleria Principii/i })
    ).toBeVisible();

    await expect(
      page.getByRole("searchbox", { name: /search/i })
    ).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });
});
