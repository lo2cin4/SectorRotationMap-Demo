(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const currentScriptUrl = document.currentScript?.src;
  const assetBaseUrl = currentScriptUrl ? new URL(".", currentScriptUrl) : new URL("assets/", document.baseURI);
  const catStripUrl = new URL("cat-walk-strip.png?v=0.6.6", assetBaseUrl).href;
  const catFrameCount = 3;
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
    const platformLayer = svgNode("g", { class: "srm-platform-layer", "aria-hidden": "true" });
    [
      [70, 50, 440, 270, "improving", "02", 14],
      [510, 50, 440, 270, "leading", "01", 24],
      [70, 320, 440, 270, "lagging", "03", 8],
      [510, 320, 440, 270, "weakening", "04", 17],
    ].forEach(([x, y, width, height, quadrant, index, depth]) => {
      const platform = svgNode("g", { class: `srm-platform srm-platform--${quadrant}` });
      platform.append(
        svgNode("polygon", {
          points: `${x},${y + height} ${x + width},${y + height} ${x + width + depth},${y + height + depth} ${x + depth},${y + height + depth}`,
          class: "srm-platform-front",
        }),
        svgNode("polygon", {
          points: `${x + width},${y} ${x + width + depth},${y + depth} ${x + width + depth},${y + height + depth} ${x + width},${y + height}`,
          class: "srm-platform-side",
        }),
        svgNode("rect", { x, y, width, height, class: `srm-zone srm-zone--${quadrant} srm-platform-top` }),
      );
      platformLayer.appendChild(platform);
      addText(platform, index, x + width / 2, y + height / 2 + 28, `srm-quadrant-index srm-quadrant-index--${quadrant}`, "middle");
    });
    svg.appendChild(platformLayer);

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
    svg.appendChild(svgNode("g", { class: "srm-trails-layer", "data-srm-trails-layer": "" }));
    svg.appendChild(svgNode("g", { class: "srm-points-layer", "data-srm-points-layer": "" }));
  };

  const labelOffset = (point, index) => {
    const quadrant = point.quadrant || quadrantFor(point);
    const rightSide = quadrant === "leading" || quadrant === "weakening";
    return {
      x: rightSide ? -22 : 22,
      y: index % 3 === 0 ? -18 : index % 3 === 1 ? 4 : 20,
      anchor: rightSide ? "end" : "start",
    };
  };

  const pawStepSessions = 5;
  const maxPawCount = 50;

  const catPawSubpath = (x, y, angle, side) => {
    const radians = angle * (Math.PI / 180);
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const transform = ([localX, localY]) => {
      const scaledX = localX * 0.9;
      const scaledY = (localY * side + side * 2.2) * 0.9;
      return [
        x + cosine * scaledX - sine * scaledY,
        y + sine * scaledX + cosine * scaledY,
      ];
    };
    const polygon = (points) => points
      .map(transform)
      .map(([pointX, pointY], index) => `${index === 0 ? "M" : "L"} ${pointX.toFixed(2)} ${pointY.toFixed(2)}`)
      .join(" ") + " Z";
    const pad = polygon([[-4, 0], [-3, -2.2], [-1, -2.5], [1.4, 0], [-1, 2.5], [-3, 2.2]]);
    const toes = [[1.3, -2.65], [3.05, -1.15], [3.15, 1.05], [1.45, 2.65]]
      .map(([toeX, toeY]) => polygon([[toeX - 0.8, toeY], [toeX, toeY - 0.7], [toeX + 0.8, toeY], [toeX, toeY + 0.7]]));
    return [pad, ...toes].join(" ");
  };

  const updatePawTail = (tail, trail) => {
    const history = trail.slice(0, -1);
    const signature = history.map((position) => position[0]).join("|");
    if (tail.dataset.srmTrailSignature === signature) return;
    tail.dataset.srmTrailSignature = signature;
    const pathData = history.map((position, historyIndex) => {
      const previous = history[Math.max(0, historyIndex - 1)] || position;
      const next = historyIndex + 1 < history.length ? history[historyIndex + 1] : position;
      const directionStart = historyIndex + 1 < history.length ? position : previous;
      const x = scaleX(position[1]);
      const y = scaleY(position[2]);
      const nextX = scaleX(next[1]);
      const nextY = scaleY(next[2]);
      const directionX = scaleX(directionStart[1]);
      const directionY = scaleY(directionStart[2]);
      const angle = Math.atan2(nextY - directionY, nextX - directionX) * (180 / Math.PI);
      const side = Math.floor(position[3] / pawStepSessions) % 2 === 0 ? 1 : -1;
      return catPawSubpath(x, y, angle, side);
    }).join(" ");
    if (tail.getAttribute("d") !== pathData) tail.setAttribute("d", pathData);
    tail.dataset.srmPawCount = String(history.length);
  };

  const drawPoints = (root, svg, points, onDrilldown) => {
    const tooltip = root.querySelector("[data-srm-tooltip]");
    const trailsLayer = svg.querySelector("[data-srm-trails-layer]");
    const pointsLayer = svg.querySelector("[data-srm-points-layer]");
    const existingTrails = new Map(
      [...trailsLayer.querySelectorAll(".srm-paw-tail")]
        .map((node) => [node.dataset.srmSymbol, node]),
    );
    const existingPoints = new Map(
      [...pointsLayer.querySelectorAll(".srm-point")]
        .map((node) => [node.dataset.srmSymbol, node]),
    );
    const activeSymbols = new Set();
    const ordered = [...points].sort((a, b) => a.symbol.localeCompare(b.symbol));
    ordered.forEach((point, index) => {
      activeSymbols.add(point.symbol);
      const quadrant = point.quadrant || quadrantFor(point);
      const color = colorFor(point);
      const trail = Array.isArray(point.trail) ? point.trail : [];
      if (trail.length > 1) {
        let pawTail = existingTrails.get(point.symbol);
        if (!pawTail) {
          pawTail = svgNode("path", {
            class: "srm-paw-tail srm-cat-paw-trace",
            "data-srm-symbol": point.symbol,
            "data-srm-paw-count": "0",
            "aria-hidden": "true",
          });
          pawTail.style.setProperty("--srm-token-color", color);
          pawTail.setAttribute("data-srm-category", point.category || point.asset_class || "quadrant");
          trailsLayer.appendChild(pawTail);
        }
        updatePawTail(pawTail, trail);
      } else {
        existingTrails.get(point.symbol)?.remove();
      }

      const x = scaleX(point.x);
      const y = scaleY(point.y);
      const label = labelOffset(point, index);
      const classLabel = point.category_label || assetClassPalette[point.asset_class]?.label || "未分類";
      let group = existingPoints.get(point.symbol);
      if (!group) {
        group = svgNode("g", {
          class: "srm-point srm-point--entering",
          tabindex: "0",
          role: "img",
          "data-srm-symbol": point.symbol,
        });
        const title = svgNode("title");
        title.textContent = `${point.label_zh_hant} (${point.symbol})`;
        const hitArea = svgNode("circle", { cx: 0, cy: -8, r: 20, class: "srm-point-hitarea", "aria-hidden": "true" });
        const catSprite = svgNode("svg", {
          x: -22,
          y: -35,
          width: 44,
          height: 44,
          viewBox: "0 0 64 64",
          class: "srm-cat-sprite",
          preserveAspectRatio: "xMidYMid meet",
          overflow: "hidden",
          "aria-hidden": "true",
        });
        catSprite.appendChild(svgNode("image", {
          href: catStripUrl,
          x: 0,
          y: 0,
          width: 192,
          height: 64,
          class: "srm-cat-strip",
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        }));
        group.append(title, hitArea, catSprite, svgNode("text", { x: 0, y: 0, class: "srm-point-label" }));
        pointsLayer.appendChild(group);
      }

      group.__srmState = { point, quadrant, classLabel, x, y, onDrilldown };
      const transform = `translate(${(x / 10).toFixed(3)}%, ${(y / 6.6).toFixed(3)}%)`;
      if (group.style.transform !== transform) group.style.transform = transform;
      if (!group.dataset.srmAccessible) {
        group.setAttribute("aria-label", `${point.label_zh_hant}，${classLabel}`);
        group.dataset.srmAccessible = "true";
      }
      const role = point.drilldown_target ? "button" : "img";
      if (group.getAttribute("role") !== role) group.setAttribute("role", role);
      if (!group.dataset.srmStyled) {
        group.setAttribute("data-srm-asset-class", point.asset_class || "quadrant");
        if (point.category) group.setAttribute("data-srm-category", point.category);
        if (point.drilldown_target) group.setAttribute("data-srm-drilldown-target", point.drilldown_target);
        group.style.setProperty("--delay", `${index * 28}ms`);
        group.style.setProperty("--srm-token-color", color);
        group.dataset.srmStyled = "true";
      }
      const text = group.querySelector(".srm-point-label");
      if (!text.dataset.srmStyled) {
        text.setAttribute("x", label.x);
        text.setAttribute("y", label.y);
        text.setAttribute("fill", color);
        text.setAttribute("text-anchor", label.anchor);
        text.textContent = point.label_zh_hant;
        text.dataset.srmStyled = "true";
      }

      if (tooltip && !group.dataset.srmTooltipReady) {
        const showTooltip = () => {
          const state = group.__srmState;
          tooltip.hidden = false;
          tooltip.style.left = `${Math.min(92, Math.max(8, (state.x / 1000) * 100))}%`;
          tooltip.style.top = `${Math.min(88, Math.max(10, (state.y / 660) * 100))}%`;
          const heading = document.createElement("strong");
          const identity = document.createElement("span");
          const values = document.createElement("span");
          heading.textContent = state.point.label_zh_hant;
          identity.textContent = `${state.point.symbol} · ${state.classLabel} · ${quadrantLabels[state.quadrant]}`;
          values.textContent = `趨勢 ${number.format(state.point.x)} ／ 動能 ${number.format(state.point.y)}`;
          tooltip.replaceChildren(heading, identity, values);
        };
        const hideTooltip = () => { tooltip.hidden = true; };
        group.addEventListener("pointerenter", showTooltip);
        group.addEventListener("pointerleave", hideTooltip);
        group.addEventListener("focus", showTooltip);
        group.addEventListener("blur", hideTooltip);
        group.dataset.srmTooltipReady = "true";
      }
      if (!group.dataset.srmDrilldownReady) {
        const activateDrilldown = () => {
          const state = group.__srmState;
          if (state.point.drilldown_target && typeof state.onDrilldown === "function") {
            state.onDrilldown(state.point);
          }
        };
        group.addEventListener("click", activateDrilldown);
        group.addEventListener("keydown", (event) => {
          if (!group.__srmState.point.drilldown_target || !["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          activateDrilldown();
        });
        group.dataset.srmDrilldownReady = "true";
      }
    });

    existingTrails.forEach((node, symbol) => {
      if (!activeSymbols.has(symbol)) node.remove();
    });
    existingPoints.forEach((node, symbol) => {
      if (!activeSymbols.has(symbol)) node.remove();
    });
  };

  const updateOptionalText = (root, selector, value) => {
    const target = root.querySelector(selector);
    if (target && target.textContent !== value) target.textContent = value;
  };

  const drawLegend = (root, universe, points) => {
    const legend = root.querySelector("[data-srm-legend]");
    if (!legend) return;
    const configured = Array.isArray(universe.categories) && universe.categories.length > 0
      ? universe.categories
      : (Array.isArray(universe.asset_classes) ? universe.asset_classes : []);
    const categoryMode = Array.isArray(universe.categories) && universe.categories.length > 0;
    const classes = configured.length > 0
      ? configured
        .filter((item) => points.some((point) => (categoryMode ? point.category : point.asset_class) === item.id))
        .map((item) => ({
          ...item,
          member_count: points.filter((point) => (categoryMode ? point.category : point.asset_class) === item.id).length,
        }))
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

  const decoratePoints = (universe, points) => {
    const categories = new Map((universe.categories || []).map((category) => [category.id, category]));
    return points.map((point) => {
      const category = categories.get(point.category);
      return category
        ? { ...point, color: category.color, category_label: category.label_zh_hant }
        : point;
    });
  };

  const pointsAt = (horizonPayload, frameIndex, trailWindow) => {
    if (!hasTimeline(horizonPayload)) return horizonPayload.points;
    const { dates, series } = horizonPayload.timeline;
    const metadata = new Map(horizonPayload.points.map((point) => [point.symbol, point]));
    return series.flatMap((item) => {
      const base = metadata.get(item.symbol) || { symbol: item.symbol, label_zh_hant: item.symbol };
      const current = item.positions[frameIndex];
      if (!Array.isArray(current)) return [];
      const [x, y] = current;
      const historyEnd = Math.max(0, Math.floor((frameIndex - 1) / pawStepSessions) * pawStepSessions);
      const firstHistoryIndex = Math.max(0, historyEnd - trailWindow + pawStepSessions);
      const sampleIndexes = [];
      for (let index = firstHistoryIndex; index <= historyEnd; index += pawStepSessions) sampleIndexes.push(index);
      const history = sampleIndexes.slice(-maxPawCount).flatMap((index) => {
        const position = item.positions[index];
        return Array.isArray(position) ? [[dates[index], position[0], position[1], index]] : [];
      });
      const trail = frameIndex === 0
        ? [[dates[frameIndex], x, y, frameIndex]]
        : [...history, [dates[frameIndex], x, y, frameIndex]];
      return [{
        ...base,
        x,
        y,
        quadrant: quadrantFor({ x, y }),
        trail,
      }];
    });
  };

  const initializeMethodDisclosure = (root) => {
    const disclosure = root.querySelector("[data-srm-method]");
    if (!disclosure || disclosure.dataset.srmMethodReady) return;
    const trigger = disclosure.querySelector("summary");
    if (!trigger) return;
    let pinned = disclosure.open;

    const setOpen = (open) => {
      disclosure.open = open;
      trigger.setAttribute("aria-expanded", String(open));
    };

    disclosure.addEventListener("pointerenter", () => setOpen(true));
    disclosure.addEventListener("pointerleave", () => {
      if (!pinned && !disclosure.contains(document.activeElement)) setOpen(false);
    });
    disclosure.addEventListener("focusin", () => setOpen(true));
    disclosure.addEventListener("focusout", (event) => {
      if (!pinned && !disclosure.contains(event.relatedTarget)) setOpen(false);
    });
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      pinned = !pinned;
      setOpen(pinned);
    });
    disclosure.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      pinned = false;
      setOpen(false);
      trigger.focus();
    });

    disclosure.dataset.srmMethodReady = "true";
    setOpen(disclosure.open);
  };

  const initialize = (root) => {
    try {
      initializeMethodDisclosure(root);
      const snapshotNode = root.querySelector("[data-srm-snapshot]");
      const snapshot = JSON.parse(snapshotNode.textContent);
      const universeSelect = root.querySelector("[data-srm-universe]");
      const chart = root.querySelector("[data-srm-chart]");
      const buttons = [...root.querySelectorAll("[data-srm-horizon]")];
      const historyPanel = root.querySelector("[data-srm-history]");
      const drilldownPanel = root.querySelector("[data-srm-drilldown]");
      const categoryFilters = root.querySelector("[data-srm-category-filters]");
      const drilldownBack = root.querySelector("[data-srm-drilldown-back]");
      const timelineInput = root.querySelector("[data-srm-timeline]");
      const playButton = root.querySelector("[data-srm-play]");
      const speedSelect = root.querySelector("[data-srm-speed]");
      const trailWindowSelect = root.querySelector("[data-srm-trail-window]");
      const playbackBaseIntervalMs = 50;
      let horizon = "60";
      let selectedDate = null;
      let playbackTimer = null;
      let activeCategory = null;
      let returnUniverseId = null;
      let renderedChromeSignature = null;
      root.dataset.srmPlaying = "false";
      root.dataset.srmCatFrame = "1";

      const syncCatFrame = (frameIndex) => {
        root.dataset.srmCatFrame = String(frameIndex + 1);
        const viewBox = `${frameIndex * 64} 0 64 64`;
        chart.querySelectorAll(".srm-cat-sprite").forEach((sprite) => {
          if (sprite.getAttribute("viewBox") !== viewBox) sprite.setAttribute("viewBox", viewBox);
        });
      };

      const syncMotionDuration = () => {
        const speed = Number(speedSelect?.value || 1);
        const frameInterval = Math.round(playbackBaseIntervalMs / speed);
        const duration = Math.max(20, Math.round(frameInterval * 0.9));
        chart.style.setProperty("--srm-frame-duration", `${duration}ms`);
      };

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

      const sourceUniverseFor = (universeId) => snapshot.universes
        .find((universe) => universe.drilldown_universe_id === universeId);

      const stopPlayback = () => {
        if (playbackTimer !== null) window.cancelAnimationFrame(playbackTimer);
        playbackTimer = null;
        root.dataset.srmPlaying = "false";
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
        if (timelineInput.min !== "0") timelineInput.min = "0";
        if (timelineInput.max !== String(dates.length - 1)) timelineInput.max = String(dates.length - 1);
        timelineInput.value = String(frameIndex);
        if (timelineInput.getAttribute("value") !== String(frameIndex)) timelineInput.setAttribute("value", String(frameIndex));
        updateOptionalText(root, "[data-srm-date]", dates[frameIndex]);
        updateOptionalText(root, "[data-srm-date-start]", dates[0]);
        updateOptionalText(root, "[data-srm-date-end]", dates.at(-1));
        updateOptionalText(root, "[data-srm-frame-count]", `${frameIndex + 1} / ${dates.length} 個交易日`);
      };

      const syncDrilldown = (universe) => {
        const categories = Array.isArray(universe.categories) ? universe.categories : [];
        if (!drilldownPanel || !categoryFilters || categories.length === 0) {
          if (drilldownPanel) drilldownPanel.hidden = true;
          return;
        }
        drilldownPanel.hidden = false;
        categoryFilters.replaceChildren();
        const filters = [{ id: "all", label_zh_hant: "全部" }, ...categories];
        filters.forEach((category) => {
          const button = document.createElement("button");
          const active = category.id === (activeCategory || "all");
          button.type = "button";
          button.dataset.srmCategory = category.id;
          button.className = active ? "is-active" : "";
          button.setAttribute("aria-pressed", String(active));
          button.textContent = category.label_zh_hant;
          if (category.color) button.style.setProperty("--srm-category-color", category.color);
          button.addEventListener("click", () => {
            stopPlayback();
            activeCategory = category.id === "all" ? null : category.id;
            render();
          });
          categoryFilters.appendChild(button);
        });
        const source = sourceUniverseFor(universe.id);
        if (drilldownBack) drilldownBack.hidden = !source;
      };

      const render = () => {
        const { universe, horizonPayload } = currentPayload();
        const trailWindow = Number(trailWindowSelect?.value || 20);
        root.dataset.srmTrailDays = String(trailWindow);
        const dates = hasTimeline(horizonPayload) ? horizonPayload.timeline.dates : [];
        const frameIndex = dates.length > 0 ? closestDateIndex(dates, selectedDate) : -1;
        if (frameIndex >= 0) selectedDate = dates[frameIndex];
        const allPoints = decoratePoints(
          universe,
          frameIndex >= 0 ? pointsAt(horizonPayload, frameIndex, trailWindow) : horizonPayload.points,
        );
        if (activeCategory && !allPoints.some((point) => point.category === activeCategory)) activeCategory = null;
        const points = activeCategory
          ? allPoints.filter((point) => point.category === activeCategory)
          : allPoints;
        const trendLeader = [...points].sort((a, b) => b.x - a.x)[0];
        const leadingCount = points.filter((point) => (point.quadrant || quadrantFor(point)) === "leading").length;
        if (!chart.dataset.srmBaseReady) {
          drawBase(chart);
          chart.dataset.srmBaseReady = "true";
        }
        const activateDrilldown = (point) => {
          if (!universe.drilldown_universe_id || !point.drilldown_target) return;
          const target = snapshot.universes.find((item) => item.id === universe.drilldown_universe_id);
          if (!target) return;
          stopPlayback();
          returnUniverseId = universe.id;
          activeCategory = point.drilldown_target;
          universeSelect.value = target.id;
          render();
        };
        drawPoints(root, chart, points, activateDrilldown);
        const catFrameIndex = frameIndex >= 0
          ? frameIndex % catFrameCount
          : 0;
        syncCatFrame(catFrameIndex);
        const nextChromeSignature = `${universe.id}:${activeCategory || "all"}:${points.map(({ symbol }) => symbol).join(",")}`;
        if (nextChromeSignature !== renderedChromeSignature) {
          drawLegend(root, universe, points);
          syncDrilldown(universe);
          renderedChromeSignature = nextChromeSignature;
        }
        syncTimeline(horizonPayload, frameIndex);
        const renderedState = Array.isArray(universe.categories) && universe.categories.length > 0
          ? `${universe.id}:${horizon}:${activeCategory || "all"}`
          : `${universe.id}:${horizon}`;
        if (chart.dataset.srmRendered !== renderedState) chart.dataset.srmRendered = renderedState;
        const frameDate = selectedDate || horizonPayload.as_of_market_date || snapshot.as_of_market_date;
        if (chart.dataset.srmFrameDate !== frameDate) chart.dataset.srmFrameDate = frameDate;
        const chartLabel = `${universe.title_zh_hant} ${horizon}日 ${frameDate} 輪動象限圖`;
        if (chart.getAttribute("aria-label") !== chartLabel) chart.setAttribute("aria-label", chartLabel);
        updateOptionalText(root, "[data-srm-leader]", trendLeader?.label_zh_hant || "—");
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
        const frameInterval = Math.round(playbackBaseIntervalMs / speed);
        let lastFrameTime = null;
        syncMotionDuration();
        root.dataset.srmPlaying = "true";
        playButton.textContent = "❚❚ 暫停";
        playButton.setAttribute("aria-pressed", "true");
        const tick = (timestamp) => {
          if (playbackTimer === null) return;
          if (lastFrameTime === null) lastFrameTime = timestamp;
          if (timestamp - lastFrameTime >= frameInterval) {
            lastFrameTime = timestamp;
            index += 1;
            if (index >= dates.length) {
              stopPlayback();
              return;
            }
            selectedDate = dates[index];
            render();
            if (index === dates.length - 1) {
              stopPlayback();
              return;
            }
          }
          playbackTimer = window.requestAnimationFrame(tick);
        };
        playbackTimer = window.requestAnimationFrame(tick);
      };

      universeSelect.addEventListener("change", () => {
        stopPlayback();
        activeCategory = null;
        returnUniverseId = null;
        render();
      });
      drilldownBack?.addEventListener("click", () => {
        const source = snapshot.universes.find((universe) => universe.id === returnUniverseId)
          || sourceUniverseFor(universeSelect.value);
        if (!source) return;
        stopPlayback();
        activeCategory = null;
        returnUniverseId = null;
        universeSelect.value = source.id;
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
        syncMotionDuration();
        if (playbackTimer === null) return;
        stopPlayback();
        startPlayback();
      });
      trailWindowSelect?.addEventListener("change", () => {
        stopPlayback();
        render();
      });
      syncMotionDuration();
      render();
    } catch (error) {
      root.classList.add("srm-shell--error");
      updateOptionalText(root, "[data-srm-error]", "圖表資料暫時無法載入。");
      console.error("Sector Rotation Map failed to initialize", error);
    }
  };

  document.querySelectorAll("[data-srm-root]").forEach(initialize);
})();
