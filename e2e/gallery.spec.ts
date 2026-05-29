import { test, expect } from "@playwright/test";

test.describe("Gallery MVP", () => {
  test("gallery loads with heading and known artwork", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Galleria Principii/i })
    ).toBeVisible();

    await expect(
      page.getByText("Study of Ophelia Among the Reeds")
    ).toBeVisible();
  });

  test('search "rose" shows rose-related artwork and hides unrelated artwork', async ({
    page,
  }) => {
    await page.goto("/");

    const search = page.getByRole("searchbox", {
      name: /search/i,
    });
    await search.fill("rose");

    await expect(page.getByText(/rose/i)).toBeVisible();

    await expect(
      page.getByText("Study of Ophelia Among the Reeds")
    ).not.toBeVisible();
  });

  test('search "zzzz-no-match" shows "No artworks found"', async ({
    page,
  }) => {
    await page.goto("/");

    const search = page.getByRole("searchbox", {
      name: /search/i,
    });
    await search.fill("zzzz-no-match");

    await expect(
      page.getByText(/No artworks found/i)
    ).toBeVisible();
  });

  test("detail view for known artwork shows description and medium", async ({
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
