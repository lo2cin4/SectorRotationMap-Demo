const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.SRM_DEMO_URL || "http://127.0.0.1:4173/";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const playbackSpeed = Number(process.env.SRM_PLAYBACK_SPEED || 1);
const frameRanges = { 0.5: [28, 34], 1: [48, 66], 2: [100, 125] };
const attributeMutationCeilings = { 0.5: 2400, 1: 4500, 2: 9000 };
const taskDurationCeilings = { 0.5: 2300, 1: 2500, 2: 3300 };

(async () => {
  const browser = await chromium.launch({ executablePath: edge, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const client = await page.context().newCDPSession(page);
    await client.send("Performance.enable");
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-srm-rendered="global_assets:60"]').waitFor();
    await page.locator("[data-srm-timeline]").fill("200");
    await page.locator("[data-srm-timeline]").dispatchEvent("input");
    await page.locator("[data-srm-speed]").selectOption(String(playbackSpeed));
    await page.locator("[data-srm-trail-window]").selectOption("250");
    const before = Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
    const result = await page.evaluate(async () => {
      const root = document.querySelector("[data-srm-root]");
      const timeline = document.querySelector("[data-srm-timeline]");
      const play = document.querySelector("[data-srm-play]");
      const mutations = { attributes: 0, childList: 0 };
      const observer = new MutationObserver((records) => records.forEach((record) => {
        if (record.type in mutations) mutations[record.type] += 1;
      }));
      observer.observe(root, { subtree: true, attributes: true, childList: true });
      const longTasks = [];
      const performanceObserver = new PerformanceObserver((list) => {
        longTasks.push(...list.getEntries().map(({ duration }) => duration));
      });
      try { performanceObserver.observe({ type: "longtask", buffered: false }); } catch {}
      const start = Number(timeline.value);
      play.click();
      await new Promise((resolve) => setTimeout(resolve, 3200));
      play.click();
      observer.disconnect();
      performanceObserver.disconnect();
      return {
        advancedFrames: Number(timeline.value) - start,
        mutations,
        longTasks,
        pawTails: document.querySelectorAll(".srm-paw-tail").length,
        catPaws: document.querySelectorAll(".srm-cat-paw").length,
        trailWindow: document.querySelector("[data-srm-trail-window]").value,
        catSprites: document.querySelectorAll(".srm-cat-sprite").length,
      };
    });
    const after = Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
    result.taskDurationMs = ((after.TaskDuration || 0) - (before.TaskDuration || 0)) * 1000;
    result.recalcStyleDurationMs = ((after.RecalcStyleDuration || 0) - (before.RecalcStyleDuration || 0)) * 1000;
    const [minimumFrames, maximumFrames] = frameRanges[playbackSpeed] || frameRanges[1];
    assert.ok(result.advancedFrames >= minimumFrames && result.advancedFrames <= maximumFrames, JSON.stringify(result));
    assert.equal(result.pawTails, 21);
    assert.equal(result.catPaws, 105);
    assert.equal(result.trailWindow, "250");
    assert.equal(result.catSprites, 21);
    assert.ok(result.mutations.attributes <= (attributeMutationCeilings[playbackSpeed] || attributeMutationCeilings[1]), JSON.stringify(result));
    assert.ok(result.mutations.childList <= 260, JSON.stringify(result));
    assert.ok(result.taskDurationMs <= (taskDurationCeilings[playbackSpeed] || taskDurationCeilings[1]), JSON.stringify(result));
    assert.ok(result.recalcStyleDurationMs <= 220 * Math.max(1, playbackSpeed), JSON.stringify(result));
    assert.equal(result.longTasks.filter((duration) => duration > 50).length, 0, JSON.stringify(result));
    console.log(JSON.stringify({ status: "pass", playbackSpeed, ...result }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
