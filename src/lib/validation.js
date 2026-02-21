"use strict";

const {
  CHART_TYPES,
  CHART_THEMES,
  CHART_DATE_LABEL_FORMATS,
  CHART_TITLE_MODES,
} = require("./chart-config");

const SLUG_RE = /^[A-Za-z0-9_.-]+$/;

function getInput(env, inputName) {
  const key = `INPUT_${inputName.replace(/-/g, "_").toUpperCase()}`;
  const raw = env[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function parseBoolean(value, inputName, defaultValue) {
  if (value === "") return defaultValue;
  const normalized = value.toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(
    `Invalid '${inputName}' value '${value}'. Use true/false (or 1/0).`,
  );
}

function parseInteger(value, inputName, defaultValue, min, max) {
  const text = value === "" ? String(defaultValue) : value;
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid '${inputName}' value '${value}'. Expected an integer.`);
  }

  const parsed = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid '${inputName}' value '${value}'. Expected ${min}..${max}.`,
    );
  }
  return parsed;
}

function parseCsvList(value, inputName, defaultValues, allowedValues) {
  const raw = value === "" ? defaultValues.join(",") : value;
  const parsed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  if (parsed.length === 0) {
    throw new Error(
      `Invalid '${inputName}' value '${value}'. Provide a comma-separated list.`,
    );
  }

  const unique = [];
  for (const entry of parsed) {
    if (!allowedValues.includes(entry)) {
      throw new Error(
        `Invalid '${inputName}' entry '${entry}'. Allowed values: ${allowedValues.join(", ")}.`,
      );
    }
    if (!unique.includes(entry)) {
      unique.push(entry);
    }
  }

  return unique;
}

function parseEnum(value, inputName, defaultValue, allowedValues) {
  const parsed = (value === "" ? defaultValue : value).trim().toLowerCase();
  if (!allowedValues.includes(parsed)) {
    throw new Error(
      `Invalid '${inputName}' value '${value}'. Allowed values: ${allowedValues.join(", ")}.`,
    );
  }
  return parsed;
}

function buildMatrixChartPaths(chartTypes, chartThemes, chartsOutputDir) {
  const paths = [];
  for (const chartType of chartTypes) {
    for (const chartTheme of chartThemes) {
      paths.push(`${chartsOutputDir}/${chartType}--${chartTheme}.svg`);
    }
  }
  return paths;
}

function validateChartPathConflicts({
  publishChart,
  outputPath,
  chartOutputPath,
  chartTypes,
  chartThemes,
  chartsOutputDir,
}) {
  if (!publishChart) return;

  const matrixPaths = buildMatrixChartPaths(chartTypes, chartThemes, chartsOutputDir);
  if (outputPath === chartOutputPath || matrixPaths.includes(outputPath)) {
    throw new Error(
      `Invalid chart configuration: 'output_path' (${outputPath}) overlaps chart output files. Use a dedicated JSON path (for example 'gh-dl/downloads.json') and keep chart files under 'chart_output_path'/'charts_output_dir'.`,
    );
  }
}

function validateSlug(value, name) {
  if (!value || !SLUG_RE.test(value)) {
    throw new Error(
      `Invalid '${name}' value '${value}'. Use letters, numbers, '.', '-' or '_'.`,
    );
  }
  return value;
}

function validateBranch(value) {
  if (!value) throw new Error("Input 'output_branch' cannot be empty.");
  const segments = value.split("/");
  if (
    value === "@" ||
    value === "HEAD" ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.startsWith("-") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{") ||
    value.endsWith(".") ||
    /[\u0000-\u001f\u007f ~^:?*\\[\]]/.test(value) ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        segment.endsWith(".lock"),
    )
  ) {
    throw new Error(
      `Invalid 'output_branch' value '${value}'. It must be a valid git branch name.`,
    );
  }
  return value;
}

function validateOutputPath(value) {
  if (!value) throw new Error("Input 'output_path' cannot be empty.");
  if (value.startsWith("/") || value.startsWith("\\")) {
    throw new Error(
      `Invalid 'output_path' value '${value}'. Use a repository-relative path.`,
    );
  }

  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(
      `Invalid 'output_path' value '${value}'. Path traversal and empty segments are not allowed.`,
    );
  }
  return normalized;
}

function parseOwnerRepo(env, ownerInput, repoInput) {
  let owner = ownerInput;
  let repo = repoInput;

  if (!owner || !repo) {
    const contextRepo = env.GITHUB_REPOSITORY || "";
    const parts = contextRepo.split("/");
    if (parts.length === 2) {
      if (!owner) owner = parts[0];
      if (!repo) repo = parts[1];
    }
  }

  if (!owner || !repo) {
    throw new Error(
      "Could not resolve target repository. Provide 'owner' and 'repo', or run in a repository context.",
    );
  }

  return {
    owner: validateSlug(owner, "owner"),
    repo: validateSlug(repo, "repo"),
  };
}

function parseActionInputs(env = process.env) {
  const tokenInput = getInput(env, "token");
  const ownerInput = getInput(env, "owner");
  const repoInput = getInput(env, "repo");
  const windowDaysInput = getInput(env, "window_days");
  const hourlyInput = getInput(env, "enable_hourly_profile");
  const branchInput = getInput(env, "output_branch");
  const outputPathInput = getInput(env, "output_path");
  const minRefreshMinutesInput = getInput(env, "min_refresh_minutes");
  const publishChartInput = getInput(env, "publish_chart");
  const chartOutputPathInput = getInput(env, "chart_output_path");
  const chartTypesInput = getInput(env, "chart_types");
  const chartThemesInput = getInput(env, "chart_themes");
  const chartsOutputDirInput = getInput(env, "charts_output_dir");
  const chartWidthInput = getInput(env, "chart_width");
  const chartHeightInput = getInput(env, "chart_height");
  const chartZeroBaselineInput = getInput(env, "chart_zero_baseline");
  const chartYTicksInput = getInput(env, "chart_y_ticks");
  const chartXLabelEveryDaysInput = getInput(env, "chart_x_label_every_days");
  const chartShowValueLabelsInput = getInput(env, "chart_show_value_labels");
  const chartDateLabelFormatInput = getInput(env, "chart_date_label_format");
  const chartShowGeneratedAtInput = getInput(env, "chart_show_generated_at");
  const chartTitleModeInput = getInput(env, "chart_title_mode");
  const chartTitleTextInput = getInput(env, "chart_title_text");

  const { owner, repo } = parseOwnerRepo(env, ownerInput, repoInput);
  const windowDays = parseInteger(windowDaysInput, "window_days", 45, 1, 3650);
  const hourlyEnabled = parseBoolean(hourlyInput, "enable_hourly_profile", false);
  const outputBranch = validateBranch(branchInput || "gh-pages");
  const outputPath = validateOutputPath(outputPathInput || "gh-dl/downloads.json");
  const minRefreshMinutes = parseInteger(
    minRefreshMinutesInput,
    "min_refresh_minutes",
    0,
    0,
    10_080,
  );
  const publishChart = parseBoolean(publishChartInput, "publish_chart", false);
  const chartOutputPath = validateOutputPath(chartOutputPathInput || "gh-dl/downloads-trend.svg");
  const chartTypes = parseCsvList(chartTypesInput, "chart_types", ["total-trend"], CHART_TYPES);
  const chartThemes = parseCsvList(chartThemesInput, "chart_themes", ["slate"], CHART_THEMES);
  const chartsOutputDir = validateOutputPath(chartsOutputDirInput || "gh-dl/charts");
  const chartWidth = parseInteger(chartWidthInput, "chart_width", 1000, 640, 4096);
  const chartHeight = parseInteger(chartHeightInput, "chart_height", 360, 240, 2160);
  const chartZeroBaseline = parseBoolean(chartZeroBaselineInput, "chart_zero_baseline", true);
  const chartYTicks = parseInteger(chartYTicksInput, "chart_y_ticks", 6, 2, 12);
  const chartXLabelEveryDays = parseInteger(
    chartXLabelEveryDaysInput,
    "chart_x_label_every_days",
    0,
    0,
    365,
  );
  const chartShowValueLabels = parseBoolean(
    chartShowValueLabelsInput,
    "chart_show_value_labels",
    false,
  );
  const chartDateLabelFormat = parseEnum(
    chartDateLabelFormatInput,
    "chart_date_label_format",
    "yyyy-mm-dd",
    CHART_DATE_LABEL_FORMATS,
  );
  const chartShowGeneratedAt = parseBoolean(
    chartShowGeneratedAtInput,
    "chart_show_generated_at",
    true,
  );
  const chartTitleMode = parseEnum(
    chartTitleModeInput,
    "chart_title_mode",
    "default",
    CHART_TITLE_MODES,
  );
  const chartTitleText = chartTitleTextInput;
  if (chartTitleMode === "custom" && chartTitleText.length === 0) {
    throw new Error(
      "Invalid chart configuration: 'chart_title_text' is required when 'chart_title_mode' is 'custom'.",
    );
  }
  if (chartTitleText.length > 120) {
    throw new Error(
      `Invalid 'chart_title_text' length (${chartTitleText.length}). Maximum length is 120 characters.`,
    );
  }
  validateChartPathConflicts({
    publishChart,
    outputPath,
    chartOutputPath,
    chartTypes,
    chartThemes,
    chartsOutputDir,
  });

  return {
    token: tokenInput,
    owner,
    repo,
    windowDays,
    hourlyEnabled,
    outputBranch,
    outputPath,
    minRefreshMinutes,
    publishChart,
    chartOutputPath,
    chartTypes,
    chartThemes,
    chartsOutputDir,
    chartWidth,
    chartHeight,
    chartZeroBaseline,
    chartYTicks,
    chartXLabelEveryDays,
    chartShowValueLabels,
    chartDateLabelFormat,
    chartShowGeneratedAt,
    chartTitleMode,
    chartTitleText,
  };
}

module.exports = {
  parseActionInputs,
  validateOutputPath,
  validateBranch,
};
