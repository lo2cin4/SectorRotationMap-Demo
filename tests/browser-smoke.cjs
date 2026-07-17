const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.SRM_DEMO_URL || "http://127.0.0.1:4173/";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const artifacts = path.join(__dirname, "artifacts");

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath: edge, headless: true });
  const errors = [];

  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await desktopContext.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-srm-rendered="global_assets:60"]').waitFor();
    assert.equal(await page.locator(".srm-point").count(), 21);
    assert.equal(await page.locator(".srm-legend-item").count(), 3);
    assert.match(await page.locator(".demo-banner").innerText(), /SYNTHETIC DEMO/);
    assert.equal(await page.locator("[data-srm-timeline]").getAttribute("max"), "519");
    assert.equal(await page.locator("[data-srm-date]").innerText(), "2026-07-17");
    await page.screenshot({ path: path.join(artifacts, "sector-rotation-global-desktop.png"), fullPage: true });

    await page.locator("[data-srm-timeline]").fill("250");
    assert.equal(await page.locator("[data-srm-timeline]").getAttribute("value"), "250");
    assert.notEqual(await page.locator("[data-srm-date]").innerText(), "2026-07-17");

    await page.locator("[data-srm-speed]").selectOption("4");
    assert.equal(await page.locator("[data-srm-speed]").inputValue(), "4");
    const beforePlayback = Number(await page.locator("[data-srm-timeline]").getAttribute("value"));
    await page.locator("[data-srm-play]").click();
    await page.waitForFunction((before) => Number(document.querySelector("[data-srm-timeline]").value) > before, beforePlayback);
    await page.locator("[data-srm-play]").click();
    assert.equal(await page.locator("[data-srm-play]").getAttribute("aria-pressed"), "false");

    await page.locator("[data-srm-universe]").selectOption("us_sectors");
    await page.locator('[data-srm-rendered="us_sectors:60"]').waitFor();
    assert.equal(await page.locator(".srm-point").count(), 11);

    await page.locator('[data-srm-horizon="120"]').click();
    await page.locator('[data-srm-rendered="us_sectors:120"]').waitFor();
    assert.equal(await page.locator('[data-srm-horizon="120"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("[data-srm-horizon-label]").innerText(), "120D");

    await page.screenshot({ path: path.join(artifacts, "sector-rotation-desktop.png"), fullPage: true });
    await page.locator(".srm-point").first().focus();
    assert.equal(await page.locator("[data-srm-tooltip]").isVisible(), true);

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const mobile = await mobileContext.newPage();
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(baseUrl, { waitUntil: "networkidle" });
    await mobile.locator('[data-srm-rendered="global_assets:60"]').waitFor();
    assert.equal(await mobile.locator(".srm-chart-wrap").evaluate((node) => node.scrollWidth > node.clientWidth), true);
    await mobile.screenshot({ path: path.join(artifacts, "sector-rotation-mobile.png"), fullPage: true });

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "pass",
      url: baseUrl,
      interactions: ["timeline:scrub", "timeline:play-pause", "speed:4x", "universe:us_sectors", "horizon:120", "point:keyboard-tooltip"],
      screenshots: ["sector-rotation-global-desktop.png", "sector-rotation-desktop.png", "sector-rotation-mobile.png"],
      console_errors: errors,
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
