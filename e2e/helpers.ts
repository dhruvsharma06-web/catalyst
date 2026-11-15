import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails the test if axe finds any WCAG 2.2 A/AA violation on the current page. */
export async function expectNoA11yViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join(", ")}`,
  );
  expect(summary, `Accessibility violations on ${context}`).toEqual([]);
}

let seq = 0;
/** A unique address per call so accounts never collide across tests and projects. */
export const uniqueEmail = (name: string): string => `${name.toLowerCase()}.${Date.now()}.${seq++}@example.com`;

/** Creates an account through the UI and lands on the circle list. */
export async function signUp(page: Page, name = "Ananya"): Promise<string> {
  const email = uniqueEmail(name);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`Hi, ${name}`) })).toBeVisible();
  return email;
}

/** Signs up, creates a care circle as family, and lands on the Today screen. Returns the circle code. */
export async function createCircle(page: Page, opts: { elderName?: string; name?: string } = {}): Promise<string> {
  await signUp(page, opts.name ?? "Ananya");
  await page.getByLabel("Who is this circle for?").fill(opts.elderName ?? "Kamala Iyer");
  await page.getByRole("radio", { name: "Family" }).check({ force: true });
  await page.getByLabel("Circle passcode").fill("sunrise-42");
  await page.getByLabel("Confirm passcode").fill("sunrise-42");
  await page.getByRole("button", { name: "Create circle" }).click();
  const code = (await page.getByText(/^[A-Z]+-\d{4}$/).first().textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kamala Iyer");
  return code;
}

/** Clicks a primary navigation link (side rail on desktop, tab bar on mobile). */
export async function goTo(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("navigation").getByRole("link", { name }).first().click();
}
