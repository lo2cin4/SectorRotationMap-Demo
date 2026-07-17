const clamp = (value) => Math.min(103.75, Math.max(96.25, value));
const round = (value) => Number(value.toFixed(4));

const quadrantFor = ({ x, y }) => {
  if (x >= 100 && y >= 100) return "leading";
  if (x < 100 && y >= 100) return "improving";
  if (x >= 100 && y < 100) return "weakening";
  return "lagging";
};

const assetClassDefinitions = {
  equity: { label_zh_hant: "股票板塊", color: "#48c7f4" },
  bond: { label_zh_hant: "債券", color: "#a887ff" },
  commodity: { label_zh_hant: "商品", color: "#ffb547" },
};

const member = (symbol, label_zh_hant, asset_class) => ({ symbol, label_zh_hant, asset_class });

const universeDefinitions = [
  {
    id: "global_assets",
    title_zh_hant: "全球跨資產輪動",
    benchmark: "SYNTHETIC-BENCHMARK-A",
    members: [
      member("IXN", "全球科技", "equity"),
      member("IXJ", "全球醫療保健", "equity"),
      member("IXG", "全球金融", "equity"),
      member("IXC", "全球能源", "equity"),
      member("KXI", "全球必需消費", "equity"),
      member("RXI", "全球非必需消費", "equity"),
      member("EXI", "全球工業", "equity"),
      member("MXI", "全球原材料", "equity"),
      member("IXP", "全球通訊服務", "equity"),
      member("JXI", "全球公用事業", "equity"),
      member("REET", "全球房地產", "equity"),
      member("TLT", "長期美債", "bond"),
      member("IEF", "中期美債", "bond"),
      member("LQD", "投資級公司債", "bond"),
      member("HYG", "高收益債", "bond"),
      member("GLD", "黃金", "commodity"),
      member("SLV", "白銀", "commodity"),
      member("USO", "原油", "commodity"),
      member("UNG", "天然氣", "commodity"),
      member("DBA", "農產品", "commodity"),
      member("DBB", "工業金屬", "commodity"),
    ],
  },
  {
    id: "us_sectors",
    title_zh_hant: "美股板塊輪動",
    benchmark: "SYNTHETIC-BENCHMARK-B",
    members: [
      member("XLC", "通訊服務", "equity"),
      member("XLY", "非必需消費", "equity"),
      member("XLP", "必需消費", "equity"),
      member("XLE", "能源", "equity"),
      member("XLF", "金融", "equity"),
      member("XLV", "醫療保健", "equity"),
      member("XLI", "工業", "equity"),
      member("XLB", "原材料", "equity"),
      member("XLRE", "房地產", "equity"),
      member("XLK", "科技", "equity"),
      member("XLU", "公用事業", "equity"),
    ],
  },
  {
    id: "global_markets",
    title_zh_hant: "全球市場輪動",
    benchmark: "SYNTHETIC-BENCHMARK-C",
    members: [
      member("SPY", "美股", "equity"),
      member("VGK", "歐股", "equity"),
      member("EWJ", "日股", "equity"),
      member("EWT", "台股", "equity"),
      member("MCHI", "中國股市", "equity"),
      member("INDA", "印度股市", "equity"),
      member("EWY", "南韓股市", "equity"),
      member("EEM", "新興市場", "equity"),
    ],
  },
];

const buildTradingDates = () => {
  const dates = [];
  const cursor = new Date(Date.UTC(2026, 6, 17));
  while (dates.length < 520) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
};

const positionAt = (memberIndex, universeIndex, horizon, dateIndex, totalDates) => {
  const progress = dateIndex / (totalDates - 1);
  const phase = memberIndex * 1.57 + universeIndex * 0.91 + horizon / 41;
  const slowCycle = progress * Math.PI * 4.4;
  const fastCycle = progress * Math.PI * 9.2;
  const x = clamp(
    100
      + Math.sin(phase + slowCycle * 0.72) * 2.55
      + Math.cos(memberIndex * 0.63 + fastCycle * 0.17) * 0.54,
  );
  const y = clamp(
    100
      + Math.cos(phase * 0.81 + slowCycle * 0.66) * 2.48
      + Math.sin(universeIndex + memberIndex * 0.41 + fastCycle * 0.19) * 0.58,
  );
  return [round(x), round(y)];
};

const buildHorizon = (universe, universeIndex, horizon, dates) => {
  const series = universe.members.map((item, memberIndex) => ({
    symbol: item.symbol,
    positions: dates.map((_, dateIndex) => positionAt(memberIndex, universeIndex, horizon, dateIndex, dates.length)),
  }));
  const lastIndex = dates.length - 1;
  const trailIndexes = Array.from({ length: 12 }, (_, index) => lastIndex - (11 - index) * 5);
  const points = universe.members.map((item, memberIndex) => {
    const positions = series[memberIndex].positions;
    const [x, y] = positions[lastIndex];
    return {
      symbol: item.symbol,
      label_zh_hant: item.label_zh_hant,
      asset_class: item.asset_class,
      x,
      y,
      quadrant: quadrantFor({ x, y }),
      trail: trailIndexes.map((index) => [dates[index], positions[index][0], positions[index][1]]),
    };
  });

  return {
    points,
    timeline: { dates, series },
  };
};

export const buildSyntheticSnapshot = () => {
  const dates = buildTradingDates();
  return {
    schema_version: "rotation-snapshot-v1",
    snapshot_id: "srm-synthetic-design-demo-v2",
    publication_state: "valid",
    as_of_market_date: "SYNTHETIC · NOT LIVE",
    provider: {
      id: "deterministic-browser-generator",
      role: "synthetic_design_demo",
    },
    quality: {
      status: "pass",
      warnings: ["Synthetic coordinates for interface evaluation only."],
    },
    universes: universeDefinitions.map((universe, universeIndex) => {
      const classIds = [...new Set(universe.members.map(({ asset_class }) => asset_class))];
      return {
        id: universe.id,
        title_zh_hant: universe.title_zh_hant,
        benchmark: universe.benchmark,
        member_count: universe.members.length,
        asset_classes: classIds.map((id) => ({
          id,
          ...assetClassDefinitions[id],
          member_count: universe.members.filter(({ asset_class }) => asset_class === id).length,
        })),
        horizons: Object.fromEntries([20, 60, 120].map((horizon) => [
          String(horizon),
          buildHorizon(universe, universeIndex, horizon, dates),
        ])),
      };
    }),
  };
};

const mountDemo = async () => {
  const snapshotNode = document.querySelector("[data-srm-snapshot]");
  snapshotNode.textContent = JSON.stringify(buildSyntheticSnapshot());
  await import("./assets/sector-rotation-map.js");
};

if (typeof document !== "undefined") {
  mountDemo().catch((error) => {
    const target = document.querySelector("[data-srm-error]");
    if (target) target.textContent = "Demo 暫時無法載入。";
    console.error(error);
  });
}
