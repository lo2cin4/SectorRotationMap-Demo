(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const quadrantColors = {
    leading: "#ff5c8f",
    improving: "#3de1d5",
    weakening: "#f7b94a",
    lagging: "#a68aff",
  };
  const assetClassPalette = {
    equity: { label: "股票板塊", color: "#48c7f4" },
    bond: { label: "債券", color: "#a887ff" },
    commodity: { label: "商品", color: "#ffb547" },
  };
  const quadrantLabels = {
    leading: "LEADING 領先",
    improving: "IMPROVING 改善",
    weakening: "WEAKENING 弱化",
    lagging: "LAGGING 落後",
  };
  const number = new Intl.NumberFormat("zh-Hant", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const svgNode = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  const scaleX = (value) => 70 + ((value - 96) / 8) * 880;
  const scaleY = (value) => 590 - ((value - 96) / 8) * 540;

  const addText = (svg, text, x, y, className, anchor = "start") => {
    const node = svgNode("text", { x, y, class: className, "text-anchor": anchor });
    node.textContent = text;
    svg.appendChild(node);
    return node;
  };

  const quadrantFor = (point) => {
    if (point.x >= 100 && point.y >= 100) return "leading";
    if (point.x < 100 && point.y >= 100) return "improving";
    if (point.x >= 100 && point.y < 100) return "weakening";
    return "lagging";
  };

  const colorFor = (point) => {
    const assetClass = assetClassPalette[point.asset_class];
    return point.color || assetClass?.color || quadrantColors[point.quadrant || quadrantFor(point)] || "#ffffff";
  };

  const drawBase = (svg) => {
    svg.replaceChildren();
    const defs = svgNode("defs");
    const filter = svgNode("filter", { id: "srm-glow", x: "-100%", y: "-100%", width: "300%", height: "300%" });
    filter.appendChild(svgNode("feGaussianBlur", { stdDeviation: "5", result: "blur" }));
    const merge = svgNode("feMerge");
    merge.appendChild(svgNode("feMergeNode", { in: "blur" }));
    merge.appendChild(svgNode("feMergeNode", { in: "SourceGraphic" }));
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    [
      [70, 50, 440, 270, "improving", "02"],
      [510, 50, 440, 270, "leading", "01"],
      [70, 320, 440, 270, "lagging", "03"],
      [510, 320, 440, 270, "weakening", "04"],
    ].forEach(([x, y, width, height, quadrant, index]) => {
      svg.appendChild(svgNode("rect", { x, y, width, height, class: `srm-zone srm-zone--${quadrant}` }));
      addText(svg, index, x + width / 2, y + height / 2 + 28, `srm-quadrant-index srm-quadrant-index--${quadrant}`, "middle");
    });

    for (let value = 96; value <= 104; value += 1) {
      const x = scaleX(value);
      const y = scaleY(value);
      svg.appendChild(svgNode("line", { x1: x, y1: 50, x2: x, y2: 590, class: value === 100 ? "srm-axis" : "srm-grid" }));
      svg.appendChild(svgNode("line", { x1: 70, y1: y, x2: 950, y2: y, class: value === 100 ? "srm-axis" : "srm-grid" }));
      addText(svg, String(value), x, 617, "srm-tick", "middle");
      addText(svg, String(value), 51, y + 4, "srm-tick", "end");
    }

    addText(svg, quadrantLabels.improving, 88, 78, "srm-quadrant srm-quadrant--improving");
    addText(svg, quadrantLabels.leading, 932, 78, "srm-quadrant srm-quadrant--leading", "end");
    addText(svg, quadrantLabels.lagging, 88, 570, "srm-quadrant srm-quadrant--lagging");
    addText(svg, quadrantLabels.weakening, 932, 570, "srm-quadrant srm-quadrant--weakening", "end");
    addText(svg, "相對趨勢強弱 →", 510, 650, "srm-axis-label", "middle");
    const yLabel = addText(svg, "相對動能 →", 20, 320, "srm-axis-label", "middle");
    yLabel.setAttribute("transform", "rotate(-90 20 320)");
  };

  const labelOffset = (point, index) => {
    const quadrant = point.quadrant || quadrantFor(point);
    const rightSide = quadrant === "leading" || quadrant === "weakening";
    return {
      x: rightSide ? -12 : 12,
      y: index % 3 === 0 ? -12 : index % 3 === 1 ? 5 : 19,
      anchor: rightSide ? "end" : "start",
    };
  };

  const drawPoints = (root, svg, points) => {
    const tooltip = root.querySelector("[data-srm-tooltip]");
    const ordered = [...points].sort((a, b) => a.symbol.localeCompare(b.symbol));
    ordered.forEach((point, index) => {
      const quadrant = point.quadrant || quadrantFor(point);
      const color = colorFor(point);
      const trail = Array.isArray(point.trail) ? point.trail : [];
      if (trail.length > 1) {
        const pathData = trail
          .map((item, trailIndex) => `${trailIndex === 0 ? "M" : "L"} ${scaleX(item[1]).toFixed(2)} ${scaleY(item[2]).toFixed(2)}`)
          .join(" ");
        svg.appendChild(svgNode("path", {
          d: pathData,
          class: "srm-trail",
          stroke: color,
          pathLength: "1",
          "data-srm-asset-class": point.asset_class || "quadrant",
          style: `--delay:${index * 28}ms`,
        }));
      }

      const x = scaleX(point.x);
      const y = scaleY(point.y);
      const label = labelOffset(point, index);
      const classLabel = assetClassPalette[point.asset_class]?.label || "未分類";
      const aria = `${point.label_zh_hant}，${classLabel}，${quadrantLabels[quadrant]}，相對趨勢 ${number.format(point.x)}，相對動能 ${number.format(point.y)}`;
      const group = svgNode("g", {
        class: "srm-point",
        style: `--delay:${index * 28}ms`,
        tabindex: "0",
        role: "img",
        "aria-label": aria,
        "data-srm-asset-class": point.asset_class || "quadrant",
      });
      const halo = svgNode("circle", { cx: x, cy: y, r: 12, fill: color, class: "srm-point-halo" });
      const dot = svgNode("circle", { cx: x, cy: y, r: 5.2, fill: color, class: "srm-point-dot" });
      const title = svgNode("title");
      title.textContent = aria;
      dot.appendChild(title);
      group.append(halo, dot);
      const text = svgNode("text", {
        x: x + label.x,
        y: y + label.y,
        class: "srm-point-label",
        fill: color,
        "text-anchor": label.anchor,
      });
      text.textContent = point.label_zh_hant;
      group.appendChild(text);

      if (tooltip) {
        const showTooltip = () => {
          tooltip.hidden = false;
          tooltip.style.left = `${Math.min(92, Math.max(8, (x / 1000) * 100))}%`;
          tooltip.style.top = `${Math.min(88, Math.max(10, (y / 660) * 100))}%`;
          const heading = document.createElement("strong");
          const identity = document.createElement("span");
          const values = document.createElement("span");
          heading.textContent = point.label_zh_hant;
          identity.textContent = `${point.symbol} · ${classLabel} · ${quadrantLabels[quadrant]}`;
          values.textContent = `趨勢 ${number.format(point.x)} ／ 動能 ${number.format(point.y)}`;
          tooltip.replaceChildren(heading, identity, values);
        };
        const hideTooltip = () => { tooltip.hidden = true; };
        group.addEventListener("pointerenter", showTooltip);
        group.addEventListener("pointerleave", hideTooltip);
        group.addEventListener("focus", showTooltip);
        group.addEventListener("blur", hideTooltip);
      }
      svg.appendChild(group);
    });
  };

  const updateOptionalText = (root, selector, value) => {
    const target = root.querySelector(selector);
    if (target) target.textContent = value;
  };

  const drawLegend = (root, universe, points) => {
    const legend = root.querySelector("[data-srm-legend]");
    if (!legend) return;
    const configured = Array.isArray(universe.asset_classes) ? universe.asset_classes : [];
    const classes = configured.length > 0
      ? configured
      : [...new Set(points.map((point) => point.asset_class).filter(Boolean))].map((id) => ({
        id,
        label_zh_hant: assetClassPalette[id]?.label || id,
        color: assetClassPalette[id]?.color,
        member_count: points.filter((point) => point.asset_class === id).length,
      }));
    legend.replaceChildren();
    classes.forEach((item) => {
      const entry = document.createElement("span");
      const swatch = document.createElement("i");
      const label = document.createElement("b");
      entry.className = "srm-legend-item";
      swatch.style.background = item.color || assetClassPalette[item.id]?.color || "#ffffff";
      label.textContent = `${item.label_zh_hant || assetClassPalette[item.id]?.label || item.id} · ${item.member_count ?? 0}`;
      entry.append(swatch, label);
      legend.appendChild(entry);
    });
    legend.hidden = classes.length === 0;
  };

  const hasTimeline = (horizonPayload) => {
    const timeline = horizonPayload?.timeline;
    return Array.isArray(timeline?.dates)
      && timeline.dates.length > 0
      && Array.isArray(timeline.series)
      && timeline.series.length > 0;
  };

  const closestDateIndex = (dates, selectedDate) => {
    if (!selectedDate) return dates.length - 1;
    const exact = dates.indexOf(selectedDate);
    if (exact >= 0) return exact;
    const later = dates.findIndex((date) => date >= selectedDate);
    return later >= 0 ? later : dates.length - 1;
  };

  const pointsAt = (horizonPayload, frameIndex) => {
    if (!hasTimeline(horizonPayload)) return horizonPayload.points;
    const { dates, series } = horizonPayload.timeline;
    const metadata = new Map(horizonPayload.points.map((point) => [point.symbol, point]));
    return series.map((item) => {
      const base = metadata.get(item.symbol) || { symbol: item.symbol, label_zh_hant: item.symbol };
      const [x, y] = item.positions[frameIndex];
      const start = Math.max(0, frameIndex - 11);
      const trail = item.positions
        .slice(start, frameIndex + 1)
        .map((position, offset) => [dates[start + offset], position[0], position[1]]);
      return {
        ...base,
        x,
        y,
        quadrant: quadrantFor({ x, y }),
        trail,
      };
    });
  };

  const initialize = (root) => {
    try {
      const snapshotNode = root.querySelector("[data-srm-snapshot]");
      const snapshot = JSON.parse(snapshotNode.textContent);
      const universeSelect = root.querySelector("[data-srm-universe]");
      const chart = root.querySelector("[data-srm-chart]");
      const buttons = [...root.querySelectorAll("[data-srm-horizon]")];
      const historyPanel = root.querySelector("[data-srm-history]");
      const timelineInput = root.querySelector("[data-srm-timeline]");
      const playButton = root.querySelector("[data-srm-play]");
      const speedSelect = root.querySelector("[data-srm-speed]");
      let horizon = "60";
      let selectedDate = null;
      let playbackTimer = null;

      snapshot.universes.forEach((universe) => {
        const option = document.createElement("option");
        option.value = universe.id;
        option.textContent = universe.title_zh_hant;
        universeSelect.appendChild(option);
      });

      updateOptionalText(root, "[data-srm-as-of]", `資料狀態 ${snapshot.as_of_market_date}`);
      updateOptionalText(
        root,
        "[data-srm-quality]",
        snapshot.quality.status === "pass" ? "QUALITY GATE · PASS" : `QUALITY GATE · ${snapshot.quality.status.toUpperCase()}`,
      );

      const currentPayload = () => {
        const universe = snapshot.universes.find((item) => item.id === universeSelect.value) || snapshot.universes[0];
        return { universe, horizonPayload: universe.horizons[horizon] };
      };

      const stopPlayback = () => {
        if (playbackTimer !== null) window.clearInterval(playbackTimer);
        playbackTimer = null;
        if (playButton) {
          playButton.textContent = "▶ 播放";
          playButton.setAttribute("aria-pressed", "false");
        }
      };

      const syncTimeline = (horizonPayload, frameIndex) => {
        if (!historyPanel || !timelineInput || !hasTimeline(horizonPayload)) {
          if (historyPanel) historyPanel.hidden = true;
          return;
        }
        historyPanel.hidden = false;
        const dates = horizonPayload.timeline.dates;
        timelineInput.min = "0";
        timelineInput.max = String(dates.length - 1);
        timelineInput.value = String(frameIndex);
        timelineInput.setAttribute("value", String(frameIndex));
        updateOptionalText(root, "[data-srm-date]", dates[frameIndex]);
        updateOptionalText(root, "[data-srm-date-start]", dates[0]);
        updateOptionalText(root, "[data-srm-date-end]", dates.at(-1));
        updateOptionalText(root, "[data-srm-frame-count]", `${frameIndex + 1} / ${dates.length} 個交易日`);
      };

      const render = () => {
        const { universe, horizonPayload } = currentPayload();
        const dates = hasTimeline(horizonPayload) ? horizonPayload.timeline.dates : [];
        const frameIndex = dates.length > 0 ? closestDateIndex(dates, selectedDate) : -1;
        if (frameIndex >= 0) selectedDate = dates[frameIndex];
        const points = frameIndex >= 0 ? pointsAt(horizonPayload, frameIndex) : horizonPayload.points;
        const trendLeader = [...points].sort((a, b) => b.x - a.x)[0];
        const leadingCount = points.filter((point) => (point.quadrant || quadrantFor(point)) === "leading").length;
        drawBase(chart);
        drawPoints(root, chart, points);
        drawLegend(root, universe, points);
        syncTimeline(horizonPayload, frameIndex);
        chart.dataset.srmRendered = `${universe.id}:${horizon}`;
        chart.dataset.srmFrameDate = selectedDate || horizonPayload.as_of_market_date || snapshot.as_of_market_date;
        chart.setAttribute("aria-label", `${universe.title_zh_hant} ${horizon}日 ${chart.dataset.srmFrameDate} 輪動象限圖`);
        updateOptionalText(root, "[data-srm-leader]", trendLeader.label_zh_hant);
        updateOptionalText(root, "[data-srm-leading-count]", String(leadingCount).padStart(2, "0"));
        updateOptionalText(root, "[data-srm-horizon-label]", `${horizon}D`);
      };

      const startPlayback = () => {
        const { horizonPayload } = currentPayload();
        if (!hasTimeline(horizonPayload) || !timelineInput) return;
        const dates = horizonPayload.timeline.dates;
        let index = Number(timelineInput.value);
        if (index >= dates.length - 1) {
          index = 0;
          selectedDate = dates[index];
          render();
        }
        const speed = Number(speedSelect?.value || 1);
        playButton.textContent = "❚❚ 暫停";
        playButton.setAttribute("aria-pressed", "true");
        playbackTimer = window.setInterval(() => {
          index += 1;
          if (index >= dates.length) {
            stopPlayback();
            return;
          }
          selectedDate = dates[index];
          render();
          if (index === dates.length - 1) stopPlayback();
        }, Math.round(800 / speed));
      };

      universeSelect.addEventListener("change", () => {
        stopPlayback();
        render();
      });
      buttons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.classList.contains("is-active")));
        button.addEventListener("click", () => {
          stopPlayback();
          horizon = button.dataset.srmHorizon;
          buttons.forEach((item) => {
            const active = item === button;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", String(active));
          });
          render();
        });
      });
      timelineInput?.addEventListener("input", () => {
        stopPlayback();
        const { horizonPayload } = currentPayload();
        if (!hasTimeline(horizonPayload)) return;
        selectedDate = horizonPayload.timeline.dates[Number(timelineInput.value)];
        render();
      });
      playButton?.addEventListener("click", () => {
        if (playbackTimer === null) startPlayback();
        else stopPlayback();
      });
      speedSelect?.addEventListener("change", () => {
        if (playbackTimer === null) return;
        stopPlayback();
        startPlayback();
      });
      render();
    } catch (error) {
      root.classList.add("srm-shell--error");
      updateOptionalText(root, "[data-srm-error]", "圖表資料暫時無法載入。");
      console.error("Sector Rotation Map failed to initialize", error);
    }
  };

  document.querySelectorAll("[data-srm-root]").forEach(initialize);
})();
