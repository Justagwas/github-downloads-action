"use strict";

const { buildPayload, formatDateUTC, mergeSnapshots } = require("./compute");
const { buildChartSvg } = require("./chart");
const { getFreshCachedTotal } = require("./cache");
const {
  extractPreviousSeries,
  hasMaterialChange,
  hasTextChange,
  isRetryableWriteConflict,
  parseJsonOrNull,
} = require("./change-utils");

async function publishPayload({ client, inputs, repoMeta, now, logger }) {
  const todayDate = formatDateUTC(now);
  const generatedAt = now.toISOString();
  const commitMessage = `chore(gh-dl): update downloads snapshot for ${inputs.owner}/${inputs.repo} (${todayDate})`;

  const maxPublishAttempts = 4;
  let payload = null;
  let changed = false;
  let total = null;
  let totalSource = "api";

  for (let attempt = 1; attempt <= maxPublishAttempts; attempt += 1) {
    const previousFile = await client.getFile(
      inputs.owner,
      inputs.repo,
      inputs.outputPath,
      inputs.outputBranch,
    );
    const previousPayload = parseJsonOrNull(previousFile?.content);
    const previousSeries = extractPreviousSeries(
      previousFile?.content,
      inputs.owner,
      inputs.repo,
      logger.warn.bind(logger),
    );

    if (total === null) {
      const cachedTotal = getFreshCachedTotal(
        previousPayload,
        inputs.owner,
        inputs.repo,
        now,
        inputs.minRefreshMinutes,
      );
      if (cachedTotal !== null) {
        total = cachedTotal;
        totalSource = "cache";
      } else {
        total = await client.getReleaseDownloadsTotal(inputs.owner, inputs.repo);
        totalSource = "api";
      }
    }

    const mergedSeries = mergeSnapshots(previousSeries, todayDate, total, inputs.windowDays);

    payload = buildPayload({
      owner: inputs.owner,
      repo: inputs.repo,
      visibility: repoMeta.private ? "private" : "public",
      generatedAt,
      total,
      todayDate,
      windowDays: inputs.windowDays,
      series: mergedSeries,
      hourlyEnabled: inputs.hourlyEnabled,
    });

    changed = hasMaterialChange(previousPayload, payload);
    if (!changed) break;

    const content = `${JSON.stringify(payload, null, 2)}\n`;

    try {
      await client.putFile(
        inputs.owner,
        inputs.repo,
        inputs.outputPath,
        inputs.outputBranch,
        content,
        commitMessage,
        previousFile?.sha,
      );
      break;
    } catch (error) {
      if (attempt >= maxPublishAttempts || !isRetryableWriteConflict(error)) {
        throw error;
      }
      logger.warn(
        `Detected concurrent write for ${inputs.outputBranch}:${inputs.outputPath}. Retrying publish (${attempt}/${maxPublishAttempts}).`,
      );
    }
  }

  if (!payload) {
    throw new Error("Failed to build downloads payload.");
  }

  return { payload, changed, totalSource, commitMessage };
}

function buildChartTargets(inputs) {
  const primaryType = inputs.chartTypes[0];
  const primaryTheme = inputs.chartThemes[0];
  const targets = [
    {
      path: inputs.chartOutputPath,
      chartType: primaryType,
      chartTheme: primaryTheme,
    },
  ];

  for (const chartType of inputs.chartTypes) {
    for (const chartTheme of inputs.chartThemes) {
      targets.push({
        path: `${inputs.chartsOutputDir}/${chartType}--${chartTheme}.svg`,
        chartType,
        chartTheme,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const target of targets) {
    if (seen.has(target.path)) continue;
    seen.add(target.path);
    unique.push(target);
  }
  return unique;
}

async function publishSingleChart({ client, inputs, target, chartSvg, commitMessage, logger }) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const previousChartFile = await client.getFile(
      inputs.owner,
      inputs.repo,
      target.path,
      inputs.outputBranch,
    );

    if (!hasTextChange(previousChartFile?.content, chartSvg)) {
      return false;
    }

    try {
      await client.putFile(
        inputs.owner,
        inputs.repo,
        target.path,
        inputs.outputBranch,
        chartSvg,
        `${commitMessage} [chart:${target.chartType}/${target.chartTheme}]`,
        previousChartFile?.sha,
      );
      return true;
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableWriteConflict(error)) {
        throw error;
      }
      logger.warn(
        `Detected concurrent write for ${inputs.outputBranch}:${target.path}. Retrying chart publish (${attempt}/${maxAttempts}).`,
      );
    }
  }

  throw new Error("Failed to publish chart after retries.");
}

async function publishChartIfEnabled({ client, inputs, payload, commitMessage, logger }) {
  if (!inputs.publishChart) {
    return {
      publishedAny: false,
      publishedCount: 0,
      totalCount: 0,
      files: [],
    };
  }

  const targets = buildChartTargets(inputs);
  let publishedCount = 0;

  for (const target of targets) {
    const chartSvg = buildChartSvg({
      owner: inputs.owner,
      repo: inputs.repo,
      series: payload.snapshots.series,
      generatedAt: payload.generatedAt,
      chartType: target.chartType,
      chartTheme: target.chartTheme,
      width: inputs.chartWidth,
      height: inputs.chartHeight,
      zeroBaseline: inputs.chartZeroBaseline,
      yTicks: inputs.chartYTicks,
      xLabelEveryDays: inputs.chartXLabelEveryDays,
      showValueLabels: inputs.chartShowValueLabels,
    });

    const published = await publishSingleChart({
      client,
      inputs,
      target,
      chartSvg,
      commitMessage,
      logger,
    });
    if (published) {
      publishedCount += 1;
    }
  }

  return {
    publishedAny: publishedCount > 0,
    publishedCount,
    totalCount: targets.length,
    files: targets.map((target) => target.path),
  };
}

module.exports = {
  publishPayload,
  publishChartIfEnabled,
};
