"use strict";

const assert = require("node:assert/strict");

const { buildPayload, mergeSnapshots } = require("../src/lib/compute");
const { parseActionInputs, validateBranch } = require("../src/lib/validation");
const { buildChartSvg, buildTrendChartSvg } = require("../src/lib/chart");

function testBuildPayloadExactBaseline() {
  const payload = buildPayload({
    owner: "octo",
    repo: "demo",
    visibility: "public",
    generatedAt: "2026-02-18T10:00:00.000Z",
    total: 150,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: {
      "2026-01-19": 100,
      "2026-02-11": 130,
      "2026-02-17": 145,
      "2026-02-18": 150,
    },
    hourlyEnabled: false,
  });

  assert.deepEqual(payload.stats, {
    total: 150,
    day: 5,
    week: 20,
    month: 50,
  });
  assert.deepEqual(payload.partial, {
    day: false,
    week: false,
    month: false,
  });
}

function testBuildPayloadPartialBaseline() {
  const payload = buildPayload({
    owner: "octo",
    repo: "demo",
    visibility: "public",
    generatedAt: "2026-02-18T10:00:00.000Z",
    total: 220,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: {
      "2026-02-15": 200,
      "2026-02-18": 220,
    },
    hourlyEnabled: true,
  });

  assert.deepEqual(payload.stats, {
    total: 220,
    day: 0,
    week: 20,
    month: 20,
  });
  assert.deepEqual(payload.partial, {
    day: true,
    week: true,
    month: true,
  });
  assert.equal(payload.profile.defaultMode, "hourly");
}

function testDeltaClamp() {
  const payload = buildPayload({
    owner: "octo",
    repo: "demo",
    visibility: "public",
    generatedAt: "2026-02-18T10:00:00.000Z",
    total: 50,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: {
      "2026-01-19": 70,
      "2026-02-11": 75,
      "2026-02-17": 80,
      "2026-02-18": 50,
    },
    hourlyEnabled: false,
  });

  assert.deepEqual(payload.stats, {
    total: 50,
    day: 0,
    week: 0,
    month: 0,
  });
}

function testMergeWindow() {
  const merged = mergeSnapshots(
    {
      "2026-02-15": 10,
      "2026-02-16": 20,
      "2026-02-17": 30,
    },
    "2026-02-18",
    40,
    2,
  );

  assert.deepEqual(merged, {
    "2026-02-17": 30,
    "2026-02-18": 40,
  });
}

function testValidateBranch() {
  const valid = ["main", "release/v1", "feature/foo.bar_baz-1", "a/b/c"];
  for (const branch of valid) {
    assert.equal(validateBranch(branch), branch);
  }

  const invalid = [
    "",
    "@",
    "HEAD",
    "/main",
    "main/",
    "main..v2",
    "main//beta",
    "main.lock",
    "foo/.hidden",
    "-feature",
    "bad name",
    "foo@{bar",
    "foo\\bar",
    "foo:bar",
    "foo/..",
  ];
  for (const branch of invalid) {
    assert.throws(() => validateBranch(branch));
  }
}

function testParseActionInputs() {
  const parsed = parseActionInputs({
    GITHUB_REPOSITORY: "x/y",
    INPUT_WINDOW_DAYS: "45",
    INPUT_ENABLE_HOURLY_PROFILE: "false",
    INPUT_OUTPUT_BRANCH: "gh-pages",
    INPUT_OUTPUT_PATH: "gh-dl/downloads.json",
    INPUT_MIN_REFRESH_MINUTES: "30",
  });

  assert.equal(parsed.minRefreshMinutes, 30);
  assert.equal(parsed.publishChart, false);
  assert.equal(parsed.chartOutputPath, "gh-dl/downloads-trend.svg");
  assert.deepEqual(parsed.chartTypes, ["total-trend"]);
  assert.deepEqual(parsed.chartThemes, ["slate"]);
  assert.equal(parsed.chartsOutputDir, "gh-dl/charts");
  assert.equal(parsed.chartWidth, 1000);
  assert.equal(parsed.chartHeight, 360);
  assert.equal(parsed.chartZeroBaseline, true);
  assert.equal(parsed.chartYTicks, 6);
  assert.equal(parsed.chartXLabelEveryDays, 0);
  assert.equal(parsed.chartShowValueLabels, false);
}

function testBuildTrendChartSvg() {
  const svg = buildTrendChartSvg({
    owner: "x",
    repo: "y",
    generatedAt: "2026-02-18T10:00:00.000Z",
    series: {
      "2026-02-17": 100,
      "2026-02-18": 120,
    },
  });

  assert.match(svg, /<svg/);
  assert.match(svg, /Latest total: 120/);
  assert.match(svg, /x\/y release downloads \(total trend\)/);
}

function testBuildChartSvgVariants() {
  const svg = buildChartSvg({
    owner: "x",
    repo: "y",
    generatedAt: "2026-02-18T10:00:00.000Z",
    chartType: "weekly",
    chartTheme: "orange",
    width: 900,
    height: 320,
    yTicks: 9,
    xLabelEveryDays: 1,
    showValueLabels: true,
    series: {
      "2026-02-10": 100,
      "2026-02-17": 140,
      "2026-02-18": 145,
    },
  });

  assert.match(svg, /weekly delta/);
  assert.match(svg, /Latest week: 5/);
  assert.match(svg, /viewBox="0 0 900 320"/);
  assert.match(svg, /text-anchor="middle">2026-02-17</);
  assert.match(svg, /class="value"/);
}

function run() {
  testBuildPayloadExactBaseline();
  testBuildPayloadPartialBaseline();
  testDeltaClamp();
  testMergeWindow();
  testValidateBranch();
  testParseActionInputs();
  testBuildTrendChartSvg();
  testBuildChartSvgVariants();
  console.log("compat checks passed");
}

run();
