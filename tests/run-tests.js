"use strict";

const assert = require("node:assert/strict");

const { buildPayload, mergeSnapshots } = require("../src/lib/compute");
const { parseActionInputs } = require("../src/lib/validation");
const { getFreshCachedTotal } = require("../src/lib/cache");
const { isRetryableWriteConflict } = require("../src/lib/change-utils");
const { run } = require("../src/index");

function testMergeWindow() {
  const merged = mergeSnapshots(
    {
      "2026-02-15": 10,
      "2026-02-16": 11,
      "2026-02-17": 12,
    },
    "2026-02-18",
    13,
    2,
  );

  assert.deepEqual(merged, {
    "2026-02-17": 12,
    "2026-02-18": 13,
  });
}

function testPayload() {
  const payload = buildPayload({
    owner: "justagwas",
    repo: "demo",
    visibility: "public",
    generatedAt: "2026-02-18T00:00:00.000Z",
    total: 120,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: {
      "2026-02-17": 100,
      "2026-02-18": 120,
    },
    hourlyEnabled: false,
  });

  assert.equal(payload.stats.day, 20);
}

function testInputs() {
  const parsed = parseActionInputs({
    GITHUB_REPOSITORY: "x/y",
    INPUT_WINDOW_DAYS: "45",
    INPUT_ENABLE_HOURLY_PROFILE: "false",
    INPUT_OUTPUT_BRANCH: "gh-pages",
    INPUT_OUTPUT_PATH: "gh-dl/downloads.json",
  });

  assert.equal(parsed.owner, "x");
  assert.equal(parsed.repo, "y");
  assert.equal(parsed.minRefreshMinutes, 0);
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

function testInputsChartMatrix() {
  const parsed = parseActionInputs({
    GITHUB_REPOSITORY: "x/y",
    INPUT_CHART_TYPES: "total-trend,daily,weekly,monthly,daily",
    INPUT_CHART_THEMES: "black,slate,orange,slate",
    INPUT_CHARTS_OUTPUT_DIR: "gh-dl/charts",
    INPUT_CHART_WIDTH: "1200",
    INPUT_CHART_HEIGHT: "420",
    INPUT_CHART_ZERO_BASELINE: "false",
    INPUT_CHART_Y_TICKS: "10",
    INPUT_CHART_X_LABEL_EVERY_DAYS: "1",
    INPUT_CHART_SHOW_VALUE_LABELS: "true",
  });

  assert.deepEqual(parsed.chartTypes, ["total-trend", "daily", "weekly", "monthly"]);
  assert.deepEqual(parsed.chartThemes, ["black", "slate", "orange"]);
  assert.equal(parsed.chartWidth, 1200);
  assert.equal(parsed.chartHeight, 420);
  assert.equal(parsed.chartZeroBaseline, false);
  assert.equal(parsed.chartYTicks, 10);
  assert.equal(parsed.chartXLabelEveryDays, 1);
  assert.equal(parsed.chartShowValueLabels, true);
}

function testGetFreshCachedTotal() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const payload = {
    owner: "x",
    repo: "y",
    generatedAt: "2026-02-18T11:55:00.000Z",
    stats: { total: 123 },
  };

  assert.equal(getFreshCachedTotal(payload, "x", "y", now, 10), 123);
  assert.equal(getFreshCachedTotal(payload, "x", "z", now, 10), null);
  assert.equal(getFreshCachedTotal(payload, "x", "y", now, 1), null);
}

function testRetryableWriteConflictClassification() {
  assert.equal(isRetryableWriteConflict({ status: 409 }), true);
  assert.equal(
    isRetryableWriteConflict({ status: 422, message: "sha does not match" }),
    true,
  );
  assert.equal(isRetryableWriteConflict({ status: 422, message: "unprocessable" }), false);
  assert.equal(isRetryableWriteConflict({ status: 500, message: "boom" }), false);
}

async function testRunUsesCacheAndSkipsApi() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const previousPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-18T11:55:00.000Z",
    total: 100,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: {
      "2026-02-17": 90,
      "2026-02-18": 100,
    },
    hourlyEnabled: false,
  });

  let apiCalls = 0;
  let putCalls = 0;
  const outputs = {};

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getReleaseDownloadsTotal() {
      apiCalls += 1;
      return 999;
    },
    async getFile() {
      return {
        sha: "sha-1",
        content: JSON.stringify(previousPayload),
      };
    },
    async putFile() {
      putCalls += 1;
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () => ({
      token: "",
      owner,
      repo,
      windowDays: 45,
      hourlyEnabled: false,
      outputBranch: "gh-pages",
      outputPath: "gh-dl/downloads.json",
      minRefreshMinutes: 10,
      publishChart: false,
      chartOutputPath: "gh-dl/downloads-trend.svg",
      chartTypes: ["total-trend"],
      chartThemes: ["slate"],
      chartsOutputDir: "gh-dl/charts",
      chartWidth: 1000,
      chartHeight: 360,
      chartZeroBaseline: true,
      chartYTicks: 6,
      chartXLabelEveryDays: 0,
      chartShowValueLabels: false,
    }),
    createGitHubClient: () => client,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: { log() {}, warn() {} },
  });

  assert.equal(apiCalls, 0);
  assert.equal(putCalls, 0);
  assert.equal(outputs.total_source, "cache");
  assert.equal(outputs.published, false);
  assert.equal(outputs.chart_published, false);
  assert.equal(outputs.chart_published_count, 0);
  assert.equal(outputs.chart_total_count, 0);
  assert.equal(outputs.chart_files, "");
}

async function testRunRetriesOnWriteConflict() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const previousPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-17T12:00:00.000Z",
    total: 10,
    todayDate: "2026-02-17",
    windowDays: 45,
    series: {
      "2026-02-17": 10,
    },
    hourlyEnabled: false,
  });

  let getFileCalls = 0;
  let apiCalls = 0;
  let putCalls = 0;
  const putShas = [];
  const warnings = [];
  const outputs = {};

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getReleaseDownloadsTotal() {
      apiCalls += 1;
      return 20;
    },
    async getFile() {
      getFileCalls += 1;
      return {
        sha: getFileCalls === 1 ? "sha-old" : "sha-new",
        content: JSON.stringify(previousPayload),
      };
    },
    async putFile(_owner, _repo, _path, _branch, _content, _message, sha) {
      putCalls += 1;
      putShas.push(sha);
      if (putCalls === 1) {
        const error = new Error("sha mismatch conflict");
        error.status = 409;
        throw error;
      }
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () => ({
      token: "",
      owner,
      repo,
      windowDays: 45,
      hourlyEnabled: false,
      outputBranch: "gh-pages",
      outputPath: "gh-dl/downloads.json",
      minRefreshMinutes: 0,
      publishChart: false,
      chartOutputPath: "gh-dl/downloads-trend.svg",
      chartTypes: ["total-trend"],
      chartThemes: ["slate"],
      chartsOutputDir: "gh-dl/charts",
      chartWidth: 1000,
      chartHeight: 360,
      chartZeroBaseline: true,
      chartYTicks: 6,
      chartXLabelEveryDays: 0,
      chartShowValueLabels: false,
    }),
    createGitHubClient: () => client,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: {
      log() {},
      warn(message) {
        warnings.push(message);
      },
    },
  });

  assert.equal(apiCalls, 1);
  assert.equal(getFileCalls, 2);
  assert.equal(putCalls, 2);
  assert.deepEqual(putShas, ["sha-old", "sha-new"]);
  assert.equal(warnings.length, 1);
  assert.equal(outputs.total_source, "api");
  assert.equal(outputs.published, true);
  assert.equal(outputs.chart_published, false);
  assert.equal(outputs.chart_published_count, 0);
  assert.equal(outputs.chart_total_count, 0);
  assert.equal(outputs.chart_files, "");
}

async function testRunPublishesChartWhenEnabled() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const outputs = {};
  let chartPutCalls = 0;
  const chartPaths = [];

  const existingPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-17T12:00:00.000Z",
    total: 10,
    todayDate: "2026-02-17",
    windowDays: 45,
    series: { "2026-02-17": 10 },
    hourlyEnabled: false,
  });

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getReleaseDownloadsTotal() {
      return 20;
    },
    async getFile(_owner, _repo, path) {
      if (path === "gh-dl/downloads.json") {
        return { sha: "sha-json", content: JSON.stringify(existingPayload) };
      }
      return { sha: "sha-chart", content: "<svg/>" };
    },
    async putFile(_owner, _repo, path) {
      if (path.endsWith(".svg")) {
        chartPutCalls += 1;
        chartPaths.push(path);
      }
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () => ({
      token: "",
      owner,
      repo,
      windowDays: 45,
      hourlyEnabled: false,
      outputBranch: "gh-pages",
      outputPath: "gh-dl/downloads.json",
      minRefreshMinutes: 0,
      publishChart: true,
      chartOutputPath: "gh-dl/downloads-trend.svg",
      chartTypes: ["total-trend", "daily"],
      chartThemes: ["black", "slate"],
      chartsOutputDir: "gh-dl/charts",
      chartWidth: 1000,
      chartHeight: 360,
      chartZeroBaseline: true,
      chartYTicks: 6,
      chartXLabelEveryDays: 1,
      chartShowValueLabels: true,
    }),
    createGitHubClient: () => client,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: { log() {}, warn() {} },
  });

  assert.equal(chartPutCalls, 5);
  assert.deepEqual(chartPaths.sort(), [
    "gh-dl/charts/daily--black.svg",
    "gh-dl/charts/daily--slate.svg",
    "gh-dl/charts/total-trend--black.svg",
    "gh-dl/charts/total-trend--slate.svg",
    "gh-dl/downloads-trend.svg",
  ]);
  assert.equal(outputs.chart_published, true);
  assert.equal(outputs.chart_output_path, "gh-dl/downloads-trend.svg");
  assert.equal(outputs.chart_published_count, 5);
  assert.equal(outputs.chart_total_count, 5);
  assert.equal(
    outputs.chart_files,
    "gh-dl/downloads-trend.svg,gh-dl/charts/total-trend--black.svg,gh-dl/charts/total-trend--slate.svg,gh-dl/charts/daily--black.svg,gh-dl/charts/daily--slate.svg",
  );
}

async function runTests() {
  testMergeWindow();
  testPayload();
  testInputs();
  testInputsChartMatrix();
  testGetFreshCachedTotal();
  testRetryableWriteConflictClassification();
  await testRunUsesCacheAndSkipsApi();
  await testRunRetriesOnWriteConflict();
  await testRunPublishesChartWhenEnabled();
  console.log("public tests passed");
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runTests,
};
