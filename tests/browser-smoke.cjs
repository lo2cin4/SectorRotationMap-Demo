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
      reducedMotion: "no-preference",
    });
    const page = await desktopContext.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-srm-rendered="global_assets:60"]').waitFor();
    assert.equal(await page.locator(".srm-point").count(), 21);
    assert.equal(await page.locator(".srm-paw-tail").count(), 21);
    assert.equal(await page.locator(".srm-cat-paw-trace").count(), 21);
    assert.equal(await page.locator(".srm-cat-paw-trace").first().evaluate((node) => node.tagName.toLowerCase()), "path");
    assert.equal(await page.locator(".srm-paw-tail").evaluateAll((tails) => tails.reduce((sum, tail) => sum + Number(tail.dataset.srmPawCount), 0)), 84);
    assert.equal(await page.locator(".srm-cat-sprite").count(), 21);
    assert.equal(await page.locator(".srm-cat-aura").count(), 0);
    assert.equal(await page.locator(".srm-cat-shadow").count(), 0);
    assert.equal(await page.locator(".srm-token-column").count(), 0);
    assert.equal(
      await page.locator(".srm-cat-sprite").evaluateAll((sprites) => sprites.every((sprite) => sprite.getAttribute("href")?.includes("cat-walk-"))),
      true,
    );
    const catAssetStatuses = await page.evaluate(async () => {
      const current = document.querySelector(".srm-cat-sprite").getAttribute("href");
      return Promise.all([1, 2, 3].map(async (frame) => {
        const response = await fetch(current.replace(/cat-walk-\d+\.png(?:\?.*)?$/, `cat-walk-${frame}.png`));
        return response.status;
      }));
    });
    assert.deepEqual(catAssetStatuses, [200, 200, 200]);
    assert.equal(await page.locator(".srm-platform").count(), 4);
    assert.equal(await page.locator(".srm-legend-item").count(), 3);
    assert.match(await page.locator(".demo-banner").innerText(), /SYNTHETIC DEMO/);
    assert.equal(await page.locator("[data-srm-timeline]").getAttribute("max"), "1967");
    assert.equal(await page.locator("[data-srm-date]").innerText(), "2026-07-17");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-design"), "isometric-city-v1");
    assert.equal(await page.locator(".srm-workbench").isVisible(), true);
    assert.equal(await page.locator(".srm-chart-head").isVisible(), true);
    const visualContract = await page.locator("[data-srm-root]").evaluate((root) => ({
      shellRadius: getComputedStyle(root).borderRadius,
      activeHorizon: getComputedStyle(root.querySelector("[data-srm-horizon].is-active")).backgroundColor,
      titleFont: getComputedStyle(root.querySelector("h1, h2")).fontFamily,
    }));
    assert.equal(visualContract.shellRadius, "7px");
    assert.equal(visualContract.activeHorizon, "rgb(216, 177, 105)");
    assert.match(visualContract.titleFont, /Shippori Mincho|Noto Serif TC/);
    await page.screenshot({ path: path.join(artifacts, "sector-rotation-editorial-desktop.png"), fullPage: true });
    const methodDisclosure = page.locator("[data-srm-method]");
    const methodTrigger = methodDisclosure.locator("summary");
    const methodPopover = methodDisclosure.locator(".srm-method-popover");
    await methodTrigger.hover();
    assert.equal(await methodPopover.isVisible(), true);
    assert.match(await methodPopover.innerText(), /X = 100/);
    await page.locator(".srm-history").hover();
    assert.equal(await methodPopover.isVisible(), false);
    await methodTrigger.focus();
    assert.equal(await methodPopover.isVisible(), true);
    await page.screenshot({ path: path.join(artifacts, "sector-rotation-global-desktop.png"), fullPage: true });

    await page.locator("[data-srm-timeline]").fill("250");
    assert.equal(await page.locator("[data-srm-timeline]").getAttribute("value"), "250");
    assert.notEqual(await page.locator("[data-srm-date]").innerText(), "2026-07-17");
    await page.waitForTimeout(900);
    const motionSymbol = await page.evaluate(() => {
      const snapshot = JSON.parse(document.querySelector("[data-srm-snapshot]").textContent);
      const timeline = snapshot.universes.find((item) => item.id === "global_assets").horizons["60"].timeline;
      return timeline.series
        .map((series) => ({
          symbol: series.symbol,
          distance: Math.hypot(
            series.positions[251][0] - series.positions[250][0],
            series.positions[251][1] - series.positions[250][1],
          ),
        }))
        .sort((left, right) => right.distance - left.distance)[0].symbol;
    });
    const centerOf = (symbol) => page.evaluate((targetSymbol) => {
      const box = document.querySelector(`.srm-point[data-srm-symbol="${targetSymbol}"]`).getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, symbol);
    await page.evaluate((symbol) => {
      window.__srmStablePlaybackPoint = document.querySelector(`.srm-point[data-srm-symbol="${symbol}"]`);
      window.__srmStablePawTail = document.querySelector(`.srm-paw-tail[data-srm-symbol="${symbol}"]`);
    }, motionSymbol);
    const startCenter = await centerOf(motionSymbol);
    await page.locator("[data-srm-timeline]").fill("251");
    const smoothFrame = await page.evaluate((symbol) => {
      const point = document.querySelector(`.srm-point[data-srm-symbol="${symbol}"]`);
      const style = getComputedStyle(point);
      return {
        sameNode: point === window.__srmStablePlaybackPoint,
        samePawTail: document.querySelector(`.srm-paw-tail[data-srm-symbol="${symbol}"]`) === window.__srmStablePawTail,
        opacity: Number(style.opacity),
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
        activeTransformTransition: point.getAnimations().some((animation) => animation.transitionProperty === "transform"),
      };
    }, motionSymbol);
    assert.equal(smoothFrame.sameNode, true);
    assert.equal(smoothFrame.samePawTail, true);
    assert.equal(smoothFrame.opacity, 1);
    assert.equal(smoothFrame.transitionDuration, "0.045s");
    assert.match(smoothFrame.transitionProperty, /transform/);
    assert.equal(smoothFrame.activeTransformTransition, true);
    await page.waitForTimeout(60);
    const endCenter = await centerOf(motionSymbol);
    const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
    assert.ok(distance(startCenter, endCenter) > 0.1);

    assert.deepEqual(
      await page.locator("[data-srm-speed] option").evaluateAll((options) => options.map((option) => option.value)),
      ["0.5", "1", "2"],
    );
    assert.deepEqual(
      await page.locator("[data-srm-trail-window] option").evaluateAll((options) => options.map((option) => option.value)),
      ["10", "20", "50", "100", "150", "200", "250"],
    );
    assert.equal(await page.locator("[data-srm-trail-window]").inputValue(), "20");
    for (const [speed, duration] of [["0.5", "0.09s"], ["1", "0.045s"], ["2", "0.023s"]]) {
      await page.locator("[data-srm-speed]").selectOption(speed);
      assert.equal(await page.locator("[data-srm-speed]").inputValue(), speed);
      assert.equal(
        await page.locator(".srm-point").first().evaluate((node) => getComputedStyle(node).transitionDuration),
        duration,
      );
    }
    await page.locator("[data-srm-timeline]").fill("300");
    await page.locator("[data-srm-timeline]").dispatchEvent("input");
    const trailDateBefore = await page.locator("[data-srm-date]").innerText();
    const shortTrailSignature = await page.locator(".srm-paw-tail").first().getAttribute("data-srm-trail-signature");
    const timelineDates = await page.evaluate(() => (
      JSON.parse(document.querySelector("[data-srm-snapshot]").textContent)
        .universes.find((universe) => universe.id === "global_assets").horizons["60"].timeline.dates
    ));
    const shortTrailIndexes = shortTrailSignature.split("|").map((date) => timelineDates.indexOf(date));
    assert.equal(shortTrailIndexes.length, 4);
    assert.deepEqual(shortTrailIndexes.slice(1).map((value, index) => value - shortTrailIndexes[index]), [5, 5, 5]);
    await page.locator("[data-srm-trail-window]").selectOption("250");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-trail-days"), "250");
    assert.equal(await page.locator("[data-srm-date]").innerText(), trailDateBefore);
    const longTrailSignature = await page.locator(".srm-paw-tail").first().getAttribute("data-srm-trail-signature");
    assert.notEqual(longTrailSignature, shortTrailSignature);
    assert.ok(longTrailSignature.split("|")[0] < shortTrailSignature.split("|")[0]);
    const longTrailIndexes = longTrailSignature.split("|").map((date) => timelineDates.indexOf(date));
    assert.equal(longTrailIndexes.length, 50);
    assert.deepEqual(longTrailIndexes.slice(1).map((value, index) => value - longTrailIndexes[index]), Array(49).fill(5));
    assert.equal(await page.locator(".srm-paw-tail").evaluateAll((tails) => tails.reduce((sum, tail) => sum + Number(tail.dataset.srmPawCount), 0)), 1050);
    assert.equal(await page.locator(".srm-cat-paw-trace").count(), 21);
    await page.locator("[data-srm-trail-window]").selectOption("20");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-cat-frame"), "1");
    assert.match(await page.locator(".srm-cat-sprite").first().getAttribute("href"), /cat-walk-1\.png/);
    await page.locator("[data-srm-timeline]").fill("301");
    await page.locator("[data-srm-timeline]").dispatchEvent("input");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-cat-frame"), "2");
    assert.match(await page.locator(".srm-cat-sprite").first().getAttribute("href"), /cat-walk-2\.png/);
    await page.locator("[data-srm-timeline]").fill("302");
    await page.locator("[data-srm-timeline]").dispatchEvent("input");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-cat-frame"), "3");
    assert.match(await page.locator(".srm-cat-sprite").first().getAttribute("href"), /cat-walk-3\.png/);
    await page.locator("[data-srm-timeline]").fill("300");
    await page.locator("[data-srm-timeline]").dispatchEvent("input");
    const beforePlayback = Number(await page.locator("[data-srm-timeline]").getAttribute("value"));
    const initialCatHref = await page.locator(".srm-cat-sprite").first().getAttribute("href");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-playing"), "false");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-cat-frame"), "1");
    await page.locator("[data-srm-play]").click();
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-playing"), "true");
    const walkCycle = await page.evaluate(async () => {
      const root = document.querySelector("[data-srm-root]");
      const sprite = document.querySelector(".srm-cat-sprite");
      const timeline = document.querySelector("[data-srm-timeline]");
      const samples = [];
      const capture = () => samples.push({
        index: Number(timeline.value),
        frame: root.dataset.srmCatFrame,
        href: sprite.getAttribute("href"),
      });
      capture();
      const observer = new MutationObserver(capture);
      observer.observe(root, { attributes: true, attributeFilter: ["data-srm-cat-frame"] });
      await new Promise((resolve) => {
        const wait = () => Number(timeline.value) >= 305 ? resolve() : requestAnimationFrame(wait);
        wait();
      });
      observer.disconnect();
      return samples;
    });
    assert.deepEqual([...new Set(walkCycle.map(({ frame }) => frame))].sort(), ["1", "2", "3"]);
    assert.equal(new Set(walkCycle.map(({ href }) => href)).size, 3);
    assert.equal(walkCycle.every(({ index, frame }) => Number(frame) === (index % 3) + 1), true);
    assert.notEqual(
      await page.locator(".srm-cat-sprite").first().getAttribute("href"),
      initialCatHref,
    );
    await page.waitForFunction((before) => Number(document.querySelector("[data-srm-timeline]").value) > before, beforePlayback);
    await page.locator("[data-srm-play]").click();
    assert.equal(await page.locator("[data-srm-play]").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("[data-srm-root]").getAttribute("data-srm-playing"), "false");
    const pausedTimelineIndex = Number(await page.locator("[data-srm-timeline]").getAttribute("value"));
    assert.equal(
      Number(await page.locator("[data-srm-root]").getAttribute("data-srm-cat-frame")),
      (pausedTimelineIndex % 3) + 1,
    );

    await page.locator("[data-srm-timeline]").fill("1967");
    await page.locator("[data-srm-universe]").selectOption("us_sectors");
    await page.locator('[data-srm-rendered="us_sectors:60"]').waitFor();
    assert.equal(await page.locator(".srm-point").count(), 11);

    await page.locator('.srm-point[data-srm-symbol="XLK"] .srm-point-hitarea').click();
    await page.locator('[data-srm-rendered="us_industries:60:technology"]').waitFor();
    assert.equal(await page.locator("[data-srm-universe]").inputValue(), "us_industries");
    assert.equal(await page.locator(".srm-point").count(), 4);
    assert.deepEqual(
      await page.locator(".srm-point").evaluateAll((points) => points.map((point) => point.dataset.srmSymbol).sort()),
      ["IGM", "IHAK", "SOXX", "XSW"],
    );
    assert.equal(await page.locator("[data-srm-drilldown]").isVisible(), true);
    await page.screenshot({ path: path.join(artifacts, "sector-rotation-industry-technology.png"), fullPage: true });

    await page.locator('[data-srm-category="all"]').click();
    await page.locator('[data-srm-rendered="us_industries:60:all"]').waitFor();
    assert.equal(await page.locator(".srm-point").count(), 20);

    await page.locator("[data-srm-drilldown-back]").click();
    await page.locator('[data-srm-rendered="us_sectors:60"]').waitFor();
    await page.locator('.srm-point[data-srm-symbol="XLK"]').focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-srm-rendered="us_industries:60:technology"]').waitFor();
    assert.equal(await page.locator(".srm-point").count(), 4);

    await page.locator("[data-srm-universe]").selectOption("us_sectors");
    await page.locator('[data-srm-rendered="us_sectors:60"]').waitFor();

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
    assert.equal(await mobile.locator(".srm-point").count(), 21);
    assert.equal(
      await mobile.locator(".srm-point").first().evaluate((node) => getComputedStyle(node).transitionDuration),
      "0s",
    );
    assert.equal(
      await mobile.locator(".srm-cat-sprite").evaluateAll((sprites) => sprites.every((sprite) => sprite.getAnimations().length === 0)),
      true,
    );
    const mobileInitialTimelineIndex = Number(await mobile.locator("[data-srm-timeline]").getAttribute("value"));
    assert.equal(
      Number(await mobile.locator("[data-srm-root]").getAttribute("data-srm-cat-frame")),
      (mobileInitialTimelineIndex % 3) + 1,
    );
    await mobile.locator("[data-srm-timeline]").fill("300");
    await mobile.locator("[data-srm-timeline]").dispatchEvent("input");
    assert.equal(await mobile.locator("[data-srm-root]").getAttribute("data-srm-cat-frame"), "1");
    await mobile.locator("[data-srm-timeline]").fill("301");
    await mobile.locator("[data-srm-timeline]").dispatchEvent("input");
    assert.equal(await mobile.locator("[data-srm-root]").getAttribute("data-srm-cat-frame"), "2");
    assert.match(await mobile.locator(".srm-cat-sprite").first().getAttribute("href"), /cat-walk-2\.png/);
    await mobile.locator("[data-srm-play]").click();
    await mobile.waitForTimeout(220);
    const reducedMotionTimelineIndex = Number(await mobile.locator("[data-srm-timeline]").getAttribute("value"));
    assert.equal(
      Number(await mobile.locator("[data-srm-root]").getAttribute("data-srm-cat-frame")),
      (reducedMotionTimelineIndex % 3) + 1,
    );
    await mobile.locator("[data-srm-play]").click();
    assert.equal(await mobile.locator("[data-srm-root]").getAttribute("data-srm-design"), "isometric-city-v1");
    await mobile.screenshot({ path: path.join(artifacts, "sector-rotation-editorial-mobile.png"), fullPage: true });
    await mobile.locator("[data-srm-method] summary").click();
    assert.equal(await mobile.locator("[data-srm-method]").getAttribute("open"), "");
    assert.equal(await mobile.locator(".srm-method-popover").isVisible(), true);
    assert.equal(await mobile.locator(".srm-chart-wrap").evaluate((node) => node.scrollWidth > node.clientWidth), true);
    await mobile.locator("[data-srm-timeline]").fill("1967");
    await mobile.locator("[data-srm-timeline]").dispatchEvent("input");
    await mobile.locator("[data-srm-universe]").selectOption("us_industries");
    await mobile.locator('[data-srm-rendered="us_industries:60:all"]').waitFor();
    assert.equal(await mobile.locator(".srm-point").count(), 20);
    assert.equal(await mobile.locator("[data-srm-drilldown]").isVisible(), true);
    await mobile.screenshot({ path: path.join(artifacts, "sector-rotation-industry-mobile.png"), fullPage: true });
    await mobile.screenshot({ path: path.join(artifacts, "sector-rotation-mobile.png"), fullPage: true });

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "pass",
      url: baseUrl,
      interactions: ["method:hover-focus-click", "timeline:2019-scrub", "timeline:smooth-node-continuity", "timeline:raf-play-pause", "speed:0.5x-2x", "paw-history:10-250d", "universe:us_sectors", "drilldown:pointer-keyboard", "industry-filter:technology-all", "visual:isometric-platforms-pixel-cat-paws", "horizon:120", "point:keyboard-tooltip", "accessibility:reduced-motion-discrete-gait"],
      screenshots: ["sector-rotation-editorial-desktop.png", "sector-rotation-global-desktop.png", "sector-rotation-industry-technology.png", "sector-rotation-desktop.png", "sector-rotation-editorial-mobile.png", "sector-rotation-industry-mobile.png", "sector-rotation-mobile.png"],
      console_errors: errors,
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
