"use strict";

const CHART_TYPES = ["total-trend", "daily", "weekly", "monthly"];
const CHART_THEMES = ["black", "slate", "orange"];
const CHART_DATE_LABEL_FORMATS = ["yyyy-mm-dd", "yy/mm/dd", "dd/mm", "mm/dd", "none"];
const CHART_TITLE_MODES = ["default", "custom", "none"];

const CHART_TYPE_META = {
  "total-trend": {
    latestLabel: "Latest total",
    rangeDays: 0,
  },
  daily: {
    latestLabel: "Latest day",
    rangeDays: 1,
  },
  weekly: {
    latestLabel: "Latest week",
    rangeDays: 7,
  },
  monthly: {
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

module.exports = {
  CHART_TYPES,
  CHART_THEMES,
  CHART_DATE_LABEL_FORMATS,
  CHART_TITLE_MODES,
  CHART_TYPE_META,
  CHART_THEME_META,
};
