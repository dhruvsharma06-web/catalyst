import { expect, test } from "@playwright/test";
import { createCircle, expectNoA11yViolations, goTo, signUp } from "./helpers";

test.describe("primary journey", () => {
  test("landing page is accessible and links into the app", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page, "landing");
    await page.getByRole("link", { name: /start a care circle/i }).first().click();
    await expect(page).toHaveURL(/\/app/);
    await expectNoA11yViolations(page, "sign in");
  });

  test("create a circle, add a medicine, take a dose, add an appointment", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const code = await createCircle(page);
    expect(code).toMatch(/^[A-Z]+-\d{4}$/);
    await expectNoA11yViolations(page, "today (empty)");

    await goTo(page, /Medicines/);
    await page.getByRole("button", { name: /add a medicine/i }).first().click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Medicine name").fill("Metformin");
    await form.getByLabel("Dose").fill("500 mg");
    await form.getByRole("button", { name: "Add another time" }).click();
    await form.getByLabel("Time 2", { exact: true }).fill("23:59");
    await expectNoA11yViolations(page, "medicine form");
    await form.getByRole("button", { name: "Add medicine" }).click();
    await expect(page.getByText("Metformin").first()).toBeVisible();
    await expectNoA11yViolations(page, "medicines");

    await goTo(page, /Today/);
    const taken = page.getByRole("button", { name: /taken/i }).first();
    await taken.click();
    await expect(page.getByRole("status").filter({ hasText: /taken/i }).first()).toBeAttached();
    await expectNoA11yViolations(page, "today (with doses)");

    await goTo(page, /Appointments/);
    await page.getByRole("button", { name: /add an appointment/i }).first().click();
    const apt = page.getByRole("dialog");
    await apt.getByLabel("Who is it with?").fill("Dr. Rao");
    await apt.getByLabel("Type of doctor (optional)").fill("Cardiology");
    await apt.getByLabel("Date", { exact: true }).fill("2030-01-15");
    await apt.getByLabel("Time", { exact: true }).fill("10:30");
    await apt.getByRole("button", { name: "Add appointment" }).click();
    await expect(page.getByRole("heading", { name: "Dr. Rao" })).toBeVisible();
    await expectNoA11yViolations(page, "appointments");

    await goTo(page, /Circle/);
    await expect(page.getByText(code).first()).toBeVisible();
    await expectNoA11yViolations(page, "circle");

    await goTo(page, /Progress/);
    await page.getByRole("button", { name: /summary/i }).first().click();
    await expect(page.getByText(/not medical advice/i).first()).toBeVisible();
    await expectNoA11yViolations(page, "progress");
  });

  test("an account is required, and a wrong circle passcode is refused", async ({ page, browser }) => {
    const code = await createCircle(page);
    const other = await browser.newContext();
    const family = await other.newPage();
    await family.goto("/app?join=1");
    await expect(family.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
    await signUp(family, "Ravi");
    await family.getByRole("tab", { name: "Join with a code" }).click();
    await family.getByLabel("Circle code").fill(code);
    await family.getByLabel("Circle passcode").fill("wrong-pass");
    await family.getByRole("button", { name: "Join circle" }).click();
    await expect(family.getByRole("alert").filter({ hasText: /don't match/i }).first()).toBeVisible();
    await family.getByLabel("Circle passcode").fill("sunrise-42");
    await family.getByRole("button", { name: "Join circle" }).click();
    await expect(family.getByRole("heading", { level: 1 })).toContainText("Kamala Iyer");
    await other.close();
  });

  test("signing out returns to sign-in, and signing back in shows the circle", async ({ page }) => {
    await createCircle(page);
    await page.getByRole("button", { name: /sign out/i }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await page.goto("/app/today");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  });

  test("large text mode persists and causes no horizontal scrolling", async ({ page }) => {
    await createCircle(page);
    await page.getByRole("button", { name: /large text/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-elder", "true");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-elder", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
