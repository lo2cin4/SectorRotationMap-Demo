const clamp = (value) => Math.min(103.75, Math.max(96.25, value));
const round = (value) => Number(value.toFixed(4));

const quadrantFor = ({ x, y }) => {
  if (x >= 100 && y >= 100) return "leading";
  if (x < 100 && y >= 100) return "improving";
  if (x >= 100 && y < 100) return "weakening";
  return "lagging";
};

const universeDefinitions = [
  {
    id: "global_assets",
    title_zh_hant: "全球商品輪動",
    benchmark: "SYNTHETIC-BENCHMARK-A",
    members: [
      ["EQ", "全球股票"],
      ["BOND", "長期債券"],
      ["GOLD", "黃金"],
      ["CMDTY", "大型商品"],
    ],
  },
  {
    id: "us_sectors",
    title_zh_hant: "美股板塊輪動",
    benchmark: "SYNTHETIC-BENCHMARK-B",
    members: [
      ["COMM", "通訊服務"],
      ["CD", "非必需消費"],
      ["CS", "必需消費"],
      ["ENERGY", "能源"],
      ["FIN", "金融"],
      ["HEALTH", "醫療保健"],
      ["IND", "工業"],
      ["MAT", "原材料"],
      ["RE", "房地產"],
      ["TECH", "科技"],
      ["UTIL", "公用事業"],
    ],
  },
  {
    id: "global_markets",
    title_zh_hant: "全球市場輪動",
    benchmark: "SYNTHETIC-BENCHMARK-C",
    members: [
      ["US", "美股"],
      ["EU", "歐股"],
      ["JP", "日股"],
      ["TW", "台股"],
    ],
  },
];

const makePoint = (member, memberIndex, universeIndex, horizon) => {
  const horizonPhase = horizon / 37;
  const phase = memberIndex * 1.71 + universeIndex * 0.83 + horizonPhase;
  const trail = Array.from({ length: 12 }, (_, trailIndex) => {
    const progress = trailIndex / 11;
    const x = clamp(100 + Math.sin(phase + progress * 1.35) * 2.72 + Math.cos(memberIndex + progress) * 0.22);
    const y = clamp(100 + Math.cos(phase * 0.79 + progress * 1.28) * 2.62 + Math.sin(universeIndex + progress) * 0.2);
    return [`DEMO-T${trailIndex - 11}`, round(x), round(y)];
  });
  const current = { x: trail.at(-1)[1], y: trail.at(-1)[2] };

  return {
    symbol: member[0],
    label_zh_hant: member[1],
    x: current.x,
    y: current.y,
    quadrant: quadrantFor(current),
    trail,
  };
};

export const buildSyntheticSnapshot = () => ({
  schema_version: "rotation-snapshot-v1",
  snapshot_id: "srm-synthetic-design-demo-v1",
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
  universes: universeDefinitions.map((universe, universeIndex) => ({
    id: universe.id,
    title_zh_hant: universe.title_zh_hant,
    benchmark: universe.benchmark,
    member_count: universe.members.length,
    horizons: Object.fromEntries([20, 60, 120].map((horizon) => [
      String(horizon),
      {
        points: universe.members.map((member, memberIndex) => makePoint(member, memberIndex, universeIndex, horizon)),
      },
    ])),
  })),
});

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
