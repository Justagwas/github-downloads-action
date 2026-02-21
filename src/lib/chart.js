"use strict";

const { normalizeSeries } = require("./compute");

const CHART_TYPES = ["total-trend", "daily", "weekly", "monthly"];
const CHART_THEMES = ["black", "slate", "orange"];

const CHART_TYPE_META = {
  "total-trend": {
    titleSuffix: "total trend",
    latestLabel: "Latest total",
    rangeDays: 0,
  },
  daily: {
    titleSuffix: "daily delta",
    latestLabel: "Latest day",
    rangeDays: 1,
  },
  weekly: {
    titleSuffix: "weekly delta",
    latestLabel: "Latest week",
    rangeDays: 7,
  },
  monthly: {
    titleSuffix: "monthly delta",
    latestLabel: "Latest month",
    rangeDays: 30,
  },
};

const CHART_THEME_META = {
  black: {
    background: "#0b0b0d",
    title: "#f8fafc",
    subtitle: "#cbd5e1",
    grid: "#1f2937",
    axis: "#94a3b8",
    line: "#22d3ee",
    dot: "#22d3ee",
    latest: "#f8fafc",
    fill: "#22d3ee",
    empty: "#cbd5e1",
    value: "#cbd5e1",
  },
  slate: {
    background: "#0f172a",
    title: "#e2e8f0",
    subtitle: "#94a3b8",
    grid: "#1e293b",
    axis: "#94a3b8",
    line: "#60a5fa",
    dot: "#60a5fa",
    latest: "#e2e8f0",
    fill: "#60a5fa",
    empty: "#cbd5e1",
    value: "#cbd5e1",
  },
  orange: {
    background: "#fff7ed",
    title: "#7c2d12",
    subtitle: "#9a3412",
    grid: "#fed7aa",
    axis: "#c2410c",
    line: "#ea580c",
    dot: "#ea580c",
    latest: "#7c2d12",
    fill: "#f97316",
    empty: "#9a3412",
    value: "#9a3412",
  },
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function shiftDate(dateString, daysAgo) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function toDayNumber(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return Math.floor(date.getTime() / 86_400_000);
}

function daysBetween(dateA, dateB) {
  return Math.abs(toDayNumber(dateA) - toDayNumber(dateB));
}

function clampInteger(value, min, max, fallback) {
  if (!Number.isInteger(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pickBaseline(entries, cutoffDate, maxIndex) {
  for (let index = 0; index <= maxIndex; index += 1) {
    if (entries[index][0] === cutoffDate) {
      return entries[index];
    }
  }

  for (let index = 0; index <= maxIndex; index += 1) {
    if (entries[index][0] > cutoffDate) {
      return entries[index];
    }
  }

  for (let index = maxIndex; index >= 0; index -= 1) {
    if (entries[index][0] < cutoffDate) {
      return entries[index];
    }
  }

  return null;
}

function toChartEntries(entries, chartType) {
  if (chartType === "total-trend") {
    return entries.map(([date, total]) => ({ date, value: total }));
  }

  const { rangeDays } = CHART_TYPE_META[chartType];
  return entries.map(([date, total], index) => {
    const baseline = pickBaseline(entries, shiftDate(date, rangeDays), index);
    const baselineValue = baseline ? baseline[1] : total;
    return { date, value: Math.max(0, total - baselineValue) };
  });
}

function buildLayout(width, height) {
  const left = Math.max(56, Math.round(width * 0.064));
  const right = Math.max(24, Math.round(width * 0.024));
  const top = Math.max(48, Math.round(height * 0.144));
  const bottom = Math.max(52, Math.round(height * 0.156));

  return {
    left,
    right,
    top,
    bottom,
    titleSize: Math.max(18, Math.round(height * 0.067)),
    subtitleSize: Math.max(11, Math.round(height * 0.036)),
    axisSize: Math.max(10, Math.round(height * 0.033)),
    latestSize: Math.max(12, Math.round(height * 0.039)),
    emptySize: Math.max(14, Math.round(height * 0.044)),
    valueSize: Math.max(9, Math.round(height * 0.03)),
  };
}

function buildXLabelIndices(points, xLabelEveryDays) {
  if (points.length <= 1) return [0];

  const indices = [0];
  if (xLabelEveryDays > 0) {
    let lastLabelDate = points[0].date;
    for (let index = 1; index < points.length - 1; index += 1) {
      if (daysBetween(points[index].date, lastLabelDate) >= xLabelEveryDays) {
        indices.push(index);
        lastLabelDate = points[index].date;
      }
    }
  } else {
    const maxLabels = 6;
    const step = Math.max(1, Math.floor((points.length - 1) / (maxLabels - 1)));
    for (let index = step; index < points.length - 1; index += step) {
      indices.push(index);
    }
  }

  const lastIndex = points.length - 1;
  if (!indices.includes(lastIndex)) {
    indices.push(lastIndex);
  }

  return indices;
}

function buildChartSvg({
  owner,
  repo,
  series,
  generatedAt,
  chartType = "total-trend",
  chartTheme = "slate",
  width = 1000,
  height = 360,
  zeroBaseline = true,
  yTicks = 6,
  xLabelEveryDays = 0,
  showValueLabels = false,
}) {
  const normalizedSeries = normalizeSeries(series);
  const entries = Object.entries(normalizedSeries).sort(([a], [b]) => a.localeCompare(b));
  const safeType = CHART_TYPES.includes(chartType) ? chartType : "total-trend";
  const safeTheme = CHART_THEMES.includes(chartTheme) ? chartTheme : "slate";
  const typeMeta = CHART_TYPE_META[safeType];
  const themeMeta = CHART_THEME_META[safeTheme];
  const safeWidth = clampInteger(width, 640, 4096, 1000);
  const safeHeight = clampInteger(height, 240, 2160, 360);
  const safeYTicks = clampInteger(yTicks, 2, 12, 6);
  const safeXLabelEveryDays = clampInteger(xLabelEveryDays, 0, 365, 0);
  const layout = buildLayout(safeWidth, safeHeight);
  const {
    left,
    right,
    top,
    bottom,
    titleSize,
    subtitleSize,
    axisSize,
    latestSize,
    emptySize,
    valueSize,
  } = layout;
  const plotWidth = safeWidth - left - right;
  const plotHeight = safeHeight - top - bottom;
  const title = `${owner}/${repo} release downloads (${typeMeta.titleSuffix})`;
  const subtitle = `Generated ${generatedAt}`;
  const gradientId = `fill-${safeType.replace(/[^a-z0-9]/g, "-")}-${safeTheme}`;

  if (entries.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeWidth} ${safeHeight}" role="img" aria-label="${escapeXml(title)} chart">
  <defs>
    <style>
      .bg { fill: ${themeMeta.background}; }
      .title { font: 700 ${titleSize}px Arial, sans-serif; fill: ${themeMeta.title}; }
      .sub { font: 400 ${subtitleSize}px Arial, sans-serif; fill: ${themeMeta.subtitle}; }
      .empty { font: 600 ${emptySize}px Arial, sans-serif; fill: ${themeMeta.empty}; }
    </style>
  </defs>
  <rect class="bg" x="0" y="0" width="${safeWidth}" height="${safeHeight}" rx="16" />
  <text class="title" x="${left}" y="${Math.round(top * 0.65)}">${escapeXml(title)}</text>
  <text class="sub" x="${left}" y="${safeHeight - Math.max(8, Math.round(subtitleSize * 0.46))}">${escapeXml(subtitle)}</text>
  <text class="empty" x="${Math.round(safeWidth / 2)}" y="${Math.round(safeHeight / 2)}" text-anchor="middle">No snapshot data yet</text>
</svg>
`;
  }

  const chartEntries = toChartEntries(entries, safeType);
  const values = chartEntries.map((entry) => entry.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const scaleMin = zeroBaseline ? 0 : rawMin;
  let scaleMax = rawMax;
  if (scaleMax <= scaleMin) {
    scaleMax = scaleMin + 1;
  }
  const safeRange = scaleMax - scaleMin;
  const latestValue = chartEntries[chartEntries.length - 1].value;

  const points = chartEntries.map((entry, index) => {
    const x =
      chartEntries.length === 1
        ? left + plotWidth / 2
        : left + (index / (chartEntries.length - 1)) * plotWidth;
    const y = top + ((scaleMax - entry.value) / safeRange) * plotHeight;
    return { date: entry.date, value: entry.value, x, y };
  });

  const pointText = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const areaPath = [
    `M ${points[0].x.toFixed(2)} ${top + plotHeight}`,
    ...points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${points[points.length - 1].x.toFixed(2)} ${top + plotHeight}`,
    "Z",
  ].join(" ");

  const grid = [];
  for (let index = 0; index <= safeYTicks; index += 1) {
    const y = top + (index / safeYTicks) * plotHeight;
    const value = Math.round(scaleMax - (index / safeYTicks) * safeRange);
    grid.push(
      `<line x1="${left}" y1="${y.toFixed(2)}" x2="${safeWidth - right}" y2="${y.toFixed(2)}" class="grid"/>`,
    );
    grid.push(
      `<text x="${left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="axis">${escapeXml(formatNumber(value))}</text>`,
    );
  }

  const xLabelIndices = buildXLabelIndices(points, safeXLabelEveryDays);
  const xLabelY = safeHeight - Math.max(22, Math.round(bottom * 0.43));
  const xLabels = xLabelIndices.map((index) => {
    const point = points[index];
    const isFirst = index === 0;
    const isLast = index === points.length - 1;
    const anchor = isFirst ? "start" : isLast ? "end" : "middle";
    return `<text class="axis" x="${point.x.toFixed(2)}" y="${xLabelY}" text-anchor="${anchor}">${escapeXml(point.date)}</text>`;
  });

  const valueLabels = showValueLabels
    ? points
        .map((point) => {
          const labelY = Math.max(top + valueSize, point.y - 8);
          return `<text class="value" x="${point.x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle">${escapeXml(formatNumber(point.value))}</text>`;
        })
        .join("\n  ")
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeWidth} ${safeHeight}" role="img" aria-label="${escapeXml(title)} chart">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${themeMeta.fill}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${themeMeta.fill}" stop-opacity="0.05"/>
    </linearGradient>
    <style>
      .bg { fill: ${themeMeta.background}; }
      .title { font: 700 ${titleSize}px Arial, sans-serif; fill: ${themeMeta.title}; }
      .sub { font: 400 ${subtitleSize}px Arial, sans-serif; fill: ${themeMeta.subtitle}; }
      .grid { stroke: ${themeMeta.grid}; stroke-width: 1; }
      .axis { font: 400 ${axisSize}px Arial, sans-serif; fill: ${themeMeta.axis}; }
      .line { fill: none; stroke: ${themeMeta.line}; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .dot { fill: ${themeMeta.dot}; }
      .value { font: 600 ${valueSize}px Arial, sans-serif; fill: ${themeMeta.value}; }
      .latest { font: 700 ${latestSize}px Arial, sans-serif; fill: ${themeMeta.latest}; }
    </style>
  </defs>
  <rect class="bg" x="0" y="0" width="${safeWidth}" height="${safeHeight}" rx="16" />
  <text class="title" x="${left}" y="${Math.round(top * 0.65)}">${escapeXml(title)}</text>
  <text class="sub" x="${left}" y="${safeHeight - Math.max(8, Math.round(subtitleSize * 0.46))}">${escapeXml(subtitle)}</text>
  ${grid.join("\n  ")}
  <path d="${areaPath}" fill="url(#${gradientId})"/>
  <polyline class="line" points="${pointText}"/>
  <circle class="dot" cx="${points[points.length - 1].x.toFixed(2)}" cy="${points[points.length - 1].y.toFixed(2)}" r="4.5"/>
  ${valueLabels}
  ${xLabels.join("\n  ")}
  <text class="latest" x="${safeWidth - right}" y="${Math.round(top * 0.65)}" text-anchor="end">${escapeXml(typeMeta.latestLabel)}: ${escapeXml(formatNumber(latestValue))}</text>
</svg>
`;
}

function buildTrendChartSvg({ owner, repo, series, generatedAt }) {
  return buildChartSvg({
    owner,
    repo,
    series,
    generatedAt,
    chartType: "total-trend",
    chartTheme: "slate",
    width: 1000,
    height: 360,
    zeroBaseline: true,
    yTicks: 6,
    xLabelEveryDays: 0,
    showValueLabels: false,
  });
}

module.exports = {
  buildChartSvg,
  buildTrendChartSvg,
  CHART_TYPES,
  CHART_THEMES,
};
