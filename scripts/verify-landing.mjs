import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "docs/landing-evidence";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ locale: "pt-BR" });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const results = [];
try {
  await page.goto("http://127.0.0.1:5174");
  await page.evaluate(() => localStorage.setItem("fio:locale", "pt-BR"));
  for (const width of [360, 390, 430, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.locator("h1").waitFor();
    const measure = await page.evaluate(() => ({
      width: innerWidth,
      height: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(measure.scrollWidth <= width, JSON.stringify(measure));
    results.push(measure);
    await page.screenshot({
      path: `${out}/after-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  assert.equal(await page.locator("#main-nav").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#main-nav").isVisible(), false);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .locator("#main-nav")
    .getByRole("link", { name: "Planos", exact: true })
    .click();
  assert.equal(await page.locator("#main-nav").isVisible(), false);
  await page.getByRole("radio", { name: "Anual", exact: true }).check();
  assert.match(
    await page.locator(".plan").nth(1).locator(".price").innerText(),
    /1.499,00/,
  );
  assert.match(
    await page.locator(".plan").nth(2).locator(".price").innerText(),
    /2.499,00/,
  );
  await page.getByRole("radio", { name: "Mensal", exact: true }).check();
  assert.match(
    await page.locator(".plan").nth(1).locator(".price").innerText(),
    /149,90/,
  );
  assert.match(
    await page.locator(".plan").nth(2).locator(".price").innerText(),
    /249,90/,
  );
  await page.locator(".plan-details summary").first().click();
  assert.equal(
    await page.locator(".plan-details").first().getAttribute("open"),
    "",
  );
  await page.locator(".faq-list summary").first().click();
  assert.equal(
    await page.locator(".faq-list details").first().getAttribute("open"),
    "",
  );
  const links = await page
    .locator("a")
    .evaluateAll((elements) =>
      elements.map((a) => ({
        text: a.textContent,
        href: a.getAttribute("href"),
      })),
    );
  for (const link of links.filter((link) => link.href?.includes("mode=signup")))
    assert.equal(
      link.href,
      "https://app.usefio.com.br/login?audience=owner&mode=signup",
    );
  for (const locale of ["pt-BR", "en", "es", "fr", "de", "it"]) {
    await page.locator(".language-select").selectOption(locale);
    await page.waitForFunction(
      (locale) => document.documentElement.lang === locale,
      locale,
    );
    for (const width of [360, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${locale} ${width} overflow`,
      );
    }
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("lang"), locale);
  }
  await page.locator(".language-select").selectOption("pt-BR");
  for (const path of ["/termos", "/privacidade", "/contato"]) {
    await page.goto("http://127.0.0.1:5174" + path);
    assert.ok(await page.locator("main h1").innerText());
  }
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/after.json`,
    JSON.stringify(
      {
        measurements: results,
        checks: [
          "six widths",
          "six locales + persistence",
          "mobile menu + Escape",
          "pricing monthly/annual",
          "plan details",
          "FAQ",
          "signup URLs",
          "information routes",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}
