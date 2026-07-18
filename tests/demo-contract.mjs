import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { inflateSync } from "node:zlib";

import { buildSyntheticSnapshot } from "../demo-snapshot.js";

const forbiddenPriceKeys = new Set([
  "open",
  "high",
  "low",
  "close",
  "adj_close",
  "volume",
  "dividends",
  "stock_splits",
  "capital_gains",
]);

const walkKeys = (value, found = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => walkKeys(item, found));
    return found;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (forbiddenPriceKeys.has(key.toLowerCase())) found.push(key);
      walkKeys(item, found);
    });
  }
  return found;
};

const paeth = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
};

const decodeRgbaPng = (buffer) => {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assert.equal(buffer[24], 8, "cat sprites must use 8-bit channels");
  assert.equal(buffer[25], 6, "cat sprites must be RGBA PNGs");
  assert.equal(buffer[28], 0, "cat sprites must not be interlaced");
  const idat = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rgba = Buffer.alloc(width * height * bytesPerPixel);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[inputOffset + x];
      const outputOffset = y * stride + x;
      const left = x >= bytesPerPixel ? rgba[outputOffset - bytesPerPixel] : 0;
      const above = y > 0 ? rgba[outputOffset - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? rgba[outputOffset - stride - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft)
                : assert.fail(`unsupported PNG filter ${filter}`);
      rgba[outputOffset] = (encoded + predictor) & 0xff;
    }
    inputOffset += stride;
  }
  return { width, height, rgba };
};

const alphaBounds = ({ width, height, rgba }) => {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return [left, top, right + 1, bottom + 1];
};

const changedPixels = (left, right, fromY, toY) => {
  let changed = 0;
  for (let y = fromY; y < toY; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const offset = (y * left.width + x) * 4;
      if (!left.rgba.subarray(offset, offset + 4).equals(right.rgba.subarray(offset, offset + 4))) changed += 1;
    }
  }
  return changed;
};

test("synthetic snapshot exposes the complete UI contract without market data", () => {
  const snapshot = buildSyntheticSnapshot();

  assert.equal(snapshot.schema_version, "rotation-snapshot-v1");
  assert.equal(snapshot.provider.role, "synthetic_design_demo");
  assert.equal(snapshot.publication_state, "valid");
  assert.deepEqual(snapshot.universes.map(({ id }) => id), [
    "global_assets",
    "us_sectors",
    "us_industries",
    "global_markets",
  ]);
  assert.deepEqual(snapshot.universes.map(({ member_count }) => member_count), [21, 11, 20, 8]);
  assert.deepEqual(walkKeys(snapshot), []);

  const [globalAssets, usSectors, usIndustries, globalMarkets] = snapshot.universes;
  assert.deepEqual(
    Object.fromEntries(globalAssets.asset_classes.map(({ id, member_count }) => [id, member_count])),
    { equity: 11, bond: 4, commodity: 6 },
  );
  assert.deepEqual(usSectors.asset_classes.map(({ id }) => id), ["equity"]);
  assert.equal(usSectors.drilldown_universe_id, "us_industries");
  assert.equal(usIndustries.categories.length, 9);
  assert.deepEqual(
    usIndustries.horizons["60"].points
      .filter(({ category }) => category === "technology")
      .map(({ symbol }) => symbol)
      .sort(),
    ["IGM", "IHAK", "SOXX", "XSW"],
  );
  assert.deepEqual(globalMarkets.asset_classes.map(({ id }) => id), ["equity"]);

  snapshot.universes.forEach((universe) => {
    assert.deepEqual(Object.keys(universe.horizons), ["20", "60", "120"]);
    Object.values(universe.horizons).forEach(({ points, timeline }) => {
      assert.equal(points.length, universe.member_count);
      assert.equal(timeline.dates.length, 1968);
      assert.equal(timeline.dates[0], "2019-01-02");
      assert.equal(timeline.dates.at(-1), "2026-07-17");
      assert.equal(timeline.series.length, universe.member_count);
      timeline.series.forEach((series) => {
        assert.equal(series.positions.length, timeline.dates.length);
        series.positions.filter(Boolean).forEach(([x, y]) => {
          assert.ok(x >= 96.2 && x <= 103.8);
          assert.ok(y >= 96.2 && y <= 103.8);
        });
      });
      points.forEach((point) => {
        assert.equal(point.trail.length, 12);
        assert.ok(["equity", "bond", "commodity"].includes(point.asset_class));
        assert.ok(point.x >= 96.2 && point.x <= 103.8);
        assert.ok(point.y >= 96.2 && point.y <= 103.8);
        assert.ok(["leading", "improving", "weakening", "lagging"].includes(point.quadrant));
      });
    });
  });
  const ihakHistory = usIndustries.horizons["60"].timeline.series.find(({ symbol }) => symbol === "IHAK");
  assert.ok(ihakHistory.positions.some((position) => position === null));
  assert.ok(ihakHistory.positions.at(-1));
});

test("public page makes synthetic status and all controls explicit", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const dashboardJs = await readFile(new URL("../assets/sector-rotation-map.js", import.meta.url), "utf8");
  const pagesWorkflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  const dashboardCss = await readFile(new URL("../assets/sector-rotation-map.css", import.meta.url), "utf8");
  const demoCss = await readFile(new URL("../assets/demo.css", import.meta.url), "utf8");
  const catFrames = await Promise.all([1, 2, 3].map((frame) => (
    readFile(new URL(`../assets/cat-walk-${frame}.png`, import.meta.url))
  )));

  assert.match(html, /SYNTHETIC DEMO/);
  assert.match(html, /非真實市場數據/);
  assert.match(html, /data-srm-universe/);
  assert.match(html, /data-srm-horizon="20"/);
  assert.match(html, /data-srm-horizon="60"/);
  assert.match(html, /data-srm-horizon="120"/);
  assert.match(html, /data-srm-timeline/);
  assert.match(html, /data-srm-date/);
  assert.match(html, /data-srm-play/);
  assert.match(html, /data-srm-speed/);
  assert.match(html, /data-srm-trail-window/);
  for (const days of [10, 20, 50, 100, 150, 200, 250]) {
    assert.match(html, new RegExp(`<option value="${days}"${days === 20 ? " selected" : ""}>${days}`));
  }
  assert.match(html, /<option value="0\.5">0\.5×<\/option>/);
  assert.match(html, /<option value="1" selected>1×<\/option>/);
  assert.match(html, /<option value="2">2×<\/option>/);
  assert.doesNotMatch(html, /<option value="4">4×<\/option>/);
  assert.match(dashboardJs, /const playbackBaseIntervalMs = 50;/);
  assert.match(dashboardJs, /requestAnimationFrame/);
  assert.doesNotMatch(dashboardJs, /setInterval/);
  assert.doesNotMatch(dashboardJs, /Math\.round\(800 \/ speed\)/);
  assert.match(html, /data-srm-legend/);
  assert.match(html, /data-srm-drilldown/);
  assert.match(html, /data-srm-category-filters/);
  assert.match(html, /data-srm-drilldown-back/);
  assert.match(html, /data-srm-chart/);
  assert.match(html, /data-srm-method/);
  assert.match(html, /查看相對強弱計算公式/);
  assert.match(html, /AdjClose/);
  assert.match(html, /RMS<sub>252<\/sub>/);
  assert.match(html, /並非 JdK RRG 或 XQ/);
  assert.match(html, /data-srm-design="isometric-city-v1"/);
  assert.match(html, /class="srm-workbench"/);
  assert.match(html, /class="srm-chart-head"/);
  assert.match(html, /RELATIVE TREND MATRIX/);
  assert.match(dashboardCss, /--srm-brand-gold:/);
  assert.match(dashboardCss, /\.srm-workbench/);
  assert.match(dashboardCss, /\.srm-chart-head/);
  assert.match(dashboardCss, /\.srm-platform--leading/);
  assert.match(dashboardCss, /\.srm-cat-sprite/);
  assert.match(dashboardCss, /\.srm-point-hitarea/);
  assert.match(dashboardCss, /image-rendering: pixelated/);
  assert.match(dashboardCss, /\.srm-paw-tail/);
  assert.match(dashboardCss, /\.srm-cat-paw-trace/);
  assert.match(dashboardCss, /\.srm-drilldown/);
  assert.match(dashboardJs, /catFrameUrls/);
  assert.match(dashboardJs, /frameIndex % catFrameUrls\.length/);
  assert.doesNotMatch(dashboardJs, /!window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(dashboardJs, /x: -22,[\s\S]*y: -35,[\s\S]*width: 44,[\s\S]*height: 44/);
  assert.doesNotMatch(dashboardJs, /catWalkBaseFrameMs|catFrameInterval|lastCatFrameTime/);
  assert.match(dashboardJs, /root\.dataset\.srmCatFrame/);
  assert.match(dashboardJs, /class: "srm-cat-sprite"/);
  assert.match(pagesWorkflow, /assets\/cat-walk-\*\.png/);
  assert.match(dashboardJs, /class: "srm-point-hitarea"/);
  assert.match(dashboardJs, /syncCatFrame/);
  assert.doesNotMatch(dashboardJs, /class: "srm-cat-aura"/);
  assert.doesNotMatch(dashboardCss, /\.srm-cat-aura/);
  assert.doesNotMatch(dashboardJs, /class: "srm-cat-shadow"/);
  assert.doesNotMatch(dashboardCss, /\.srm-cat-shadow/);
  assert.doesNotMatch(dashboardCss, /data-srm-cat-frame=.*translateY/);
  assert.match(dashboardJs, /class: "srm-paw-tail srm-cat-paw-trace"/);
  assert.match(dashboardJs, /const pawStepSessions = 5;/);
  assert.match(dashboardJs, /const maxPawCount = 50;/);
  assert.doesNotMatch(dashboardJs, /const pawCount = 5;/);
  assert.match(dashboardJs, /const pointsAt = \(horizonPayload, frameIndex, trailWindow\)/);
  assert.match(dashboardJs, /historyEnd - trailWindow/);
  assert.match(dashboardJs, /catPawSubpath/);
  assert.match(dashboardJs, /data-srm-paw-count/);
  assert.doesNotMatch(dashboardJs, /svgNode\("ellipse", \{ cx: -0\.8, cy: 0, rx: 2\.35/);
  assert.doesNotMatch(dashboardJs, /srm-energy-rail/);
  assert.doesNotMatch(dashboardCss, /srm-energy-rail/);
  assert.doesNotMatch(dashboardJs, /class: "srm-token-column"/);
  assert.doesNotMatch(dashboardCss, /\.srm-token-column/);
  assert.doesNotMatch(dashboardJs, /class: "srm-light-segment"/);
  assert.doesNotMatch(dashboardJs, /feGaussianBlur/);
  catFrames.forEach((frame) => {
    assert.deepEqual([...frame.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(frame.length > 1000);
  });
  const decodedCatFrames = catFrames.map(decodeRgbaPng);
  decodedCatFrames.forEach(({ width, height }) => assert.deepEqual([width, height], [64, 64]));
  const frameBounds = decodedCatFrames.map(alphaBounds);
  frameBounds.slice(1).forEach((bounds) => assert.deepEqual(bounds, frameBounds[0], "cat frames must share one fixed alpha box"));
  const fixedBodyEndY = 42;
  for (let index = 1; index < decodedCatFrames.length; index += 1) {
    assert.equal(changedPixels(decodedCatFrames[0], decodedCatFrames[index], 0, fixedBodyEndY), 0, "head and torso must remain pixel-identical");
    assert.ok(changedPixels(decodedCatFrames[0], decodedCatFrames[index], fixedBodyEndY, 64) >= 45, "leg poses must be visually distinct");
  }
  assert.match(dashboardCss, /font-family: var\(--srm-brand-serif\)/);
  assert.match(demoCss, /lo2cin4/);
  assert.doesNotMatch(html, /snapshots\/latest\.json|sector_rotation\.sqlite3|yfinance/i);
});

test("public repository excludes canonical state and production snapshots", async () => {
  const root = new URL("../", import.meta.url);
  const visit = async (directory, relative = "") => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", "artifacts", "_site", "node_modules"].includes(entry.name)) continue;
      const childRelative = `${relative}${entry.name}`;
      const childUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) files.push(...await visit(childUrl, `${childRelative}/`));
      else files.push({ path: childRelative, size: (await stat(childUrl)).size });
    }
    return files;
  };
  const files = await visit(root);

  assert.equal(files.some(({ path }) => /\.sqlite(?:3)?(?:$|-)|snapshots\/latest\.json/i.test(path)), false);
  assert.equal(files.some(({ size }) => size > 1_000_000), false);
});
