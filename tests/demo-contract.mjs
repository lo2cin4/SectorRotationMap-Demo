import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

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

test("synthetic snapshot exposes the complete UI contract without market data", () => {
  const snapshot = buildSyntheticSnapshot();

  assert.equal(snapshot.schema_version, "rotation-snapshot-v1");
  assert.equal(snapshot.provider.role, "synthetic_design_demo");
  assert.equal(snapshot.publication_state, "valid");
  assert.deepEqual(snapshot.universes.map(({ id }) => id), [
    "global_assets",
    "us_sectors",
    "global_markets",
  ]);
  assert.deepEqual(snapshot.universes.map(({ member_count }) => member_count), [21, 11, 8]);
  assert.deepEqual(walkKeys(snapshot), []);

  const [globalAssets, usSectors, globalMarkets] = snapshot.universes;
  assert.deepEqual(
    Object.fromEntries(globalAssets.asset_classes.map(({ id, member_count }) => [id, member_count])),
    { equity: 11, bond: 4, commodity: 6 },
  );
  assert.deepEqual(usSectors.asset_classes.map(({ id }) => id), ["equity"]);
  assert.deepEqual(globalMarkets.asset_classes.map(({ id }) => id), ["equity"]);

  snapshot.universes.forEach((universe) => {
    assert.deepEqual(Object.keys(universe.horizons), ["20", "60", "120"]);
    Object.values(universe.horizons).forEach(({ points, timeline }) => {
      assert.equal(points.length, universe.member_count);
      assert.equal(timeline.dates.length, 520);
      assert.equal(timeline.dates[0], "2024-07-22");
      assert.equal(timeline.dates.at(-1), "2026-07-17");
      assert.equal(timeline.series.length, universe.member_count);
      timeline.series.forEach((series) => {
        assert.equal(series.positions.length, timeline.dates.length);
        series.positions.forEach(([x, y]) => {
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
});

test("public page makes synthetic status and all controls explicit", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const dashboardJs = await readFile(new URL("../assets/sector-rotation-map.js", import.meta.url), "utf8");
  const dashboardCss = await readFile(new URL("../assets/sector-rotation-map.css", import.meta.url), "utf8");
  const demoCss = await readFile(new URL("../assets/demo.css", import.meta.url), "utf8");

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
  assert.match(html, /<option value="0\.5">0\.5×<\/option>/);
  assert.match(html, /<option value="1" selected>1×<\/option>/);
  assert.match(html, /<option value="2">2×<\/option>/);
  assert.doesNotMatch(html, /<option value="4">4×<\/option>/);
  assert.match(dashboardJs, /const playbackBaseIntervalMs = 200;/);
  assert.match(dashboardJs, /Math\.round\(playbackBaseIntervalMs \/ speed\)/);
  assert.doesNotMatch(dashboardJs, /Math\.round\(800 \/ speed\)/);
  assert.match(html, /data-srm-legend/);
  assert.match(html, /data-srm-chart/);
  assert.match(html, /data-srm-method/);
  assert.match(html, /查看相對強弱計算公式/);
  assert.match(html, /AdjClose/);
  assert.match(html, /RMS<sub>252<\/sub>/);
  assert.match(html, /並非 JdK RRG 或 XQ/);
  assert.match(html, /data-srm-design="lo2cin4-editorial-v2"/);
  assert.match(html, /class="srm-workbench"/);
  assert.match(html, /class="srm-chart-head"/);
  assert.match(html, /RELATIVE TREND MATRIX/);
  assert.match(dashboardCss, /--srm-brand-gold:/);
  assert.match(dashboardCss, /\.srm-workbench/);
  assert.match(dashboardCss, /\.srm-chart-head/);
  assert.match(dashboardCss, /font-family: var\(--srm-brand-serif\)/);
  assert.match(demoCss, /lo2cin4/);
  assert.doesNotMatch(html, /snapshots\/latest\.json|sector_rotation\.sqlite3|yfinance/i);
});

test("public repository excludes canonical state and production snapshots", async () => {
  const root = new URL("../", import.meta.url);
  const visit = async (directory, relative = "") => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", "artifacts", "_site"].includes(entry.name)) continue;
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
