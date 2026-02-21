"use strict";

const fs = require("node:fs");

const { parseActionInputs } = require("./lib/validation");
const { createGitHubClient } = require("./lib/github-api");
const { publishPayload, publishChartIfEnabled } = require("./lib/publish");

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    console.log(`output ${name}=${value}`);
    return;
  }

  fs.appendFileSync(outputFile, `${name}=${String(value)}\n`, "utf8");
}

function appendSummary(lines) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;
  fs.appendFileSync(summaryFile, `${lines.join("\n")}\n`, "utf8");
}

function appendRunSummary({ inputs, payload, changed, totalSource, chartResult }, writeSummary) {
  writeSummary([
    "## GitHub Downloads Snapshot",
    "",
    `- Repository: \`${inputs.owner}/${inputs.repo}\``,
    `- Output: \`${inputs.outputBranch}:${inputs.outputPath}\``,
    `- Published: **${changed ? "yes" : "no (no material change)"}**`,
    `- Chart: **${inputs.publishChart ? "enabled" : "disabled"}**${inputs.publishChart ? ` (\`${inputs.outputBranch}:${inputs.chartOutputPath}\`, updated: ${chartResult.publishedCount}/${chartResult.totalCount})` : ""}`,
    `- Total source: **${totalSource}**`,
    `- Total: **${payload.stats.total}**`,
    `- Day: **${payload.stats.day}** (partial: ${payload.partial.day})`,
    `- Week: **${payload.stats.week}** (partial: ${payload.partial.week})`,
    `- Month: **${payload.stats.month}** (partial: ${payload.partial.month})`,
    `- Snapshot count: **${payload.snapshots.count}**`,
    `- Generated at: \`${payload.generatedAt}\``,
  ]);
}

function setActionOutputs({ inputs, payload, changed, totalSource, chartResult }, writeOutput) {
  writeOutput("owner", inputs.owner);
  writeOutput("repo", inputs.repo);
  writeOutput("generated_at", payload.generatedAt);
  writeOutput("total", payload.stats.total);
  writeOutput("day", payload.stats.day);
  writeOutput("week", payload.stats.week);
  writeOutput("month", payload.stats.month);
  writeOutput("partial_day", payload.partial.day);
  writeOutput("partial_week", payload.partial.week);
  writeOutput("partial_month", payload.partial.month);
  writeOutput("chart_output_path", inputs.chartOutputPath);
  writeOutput("chart_published", chartResult.publishedAny);
  writeOutput("chart_published_count", chartResult.publishedCount);
  writeOutput("chart_total_count", chartResult.totalCount);
  writeOutput("chart_files", chartResult.files.join(","));
  writeOutput("output_branch", inputs.outputBranch);
  writeOutput("output_path", inputs.outputPath);
  writeOutput("total_source", totalSource);
  writeOutput("published", changed);
}

async function run(options = {}) {
  const env = options.env || process.env;
  const parseInputs = options.parseActionInputs || parseActionInputs;
  const createClient = options.createGitHubClient || createGitHubClient;
  const nowProvider = options.nowProvider || (() => new Date());
  const writeOutput = options.setOutput || setOutput;
  const writeSummary = options.appendSummary || appendSummary;
  const logger = options.logger || console;

  const inputs = parseInputs(env);
  const token = inputs.token || env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "A token is required. Pass with.token: ${{ secrets.GITHUB_TOKEN }} (recommended), or set env.GITHUB_TOKEN.",
    );
  }

  const client = createClient(token);
  const repoMeta = await client.getRepository(inputs.owner, inputs.repo);
  await client.ensureBranch(inputs.owner, inputs.repo, inputs.outputBranch, repoMeta.default_branch);

  const now = nowProvider();
  const publishResult = await publishPayload({
    client,
    inputs,
    repoMeta,
    now,
    logger,
  });

  const chartResult = await publishChartIfEnabled({
    client,
    inputs,
    payload: publishResult.payload,
    commitMessage: publishResult.commitMessage,
    logger,
  });

  const result = {
    inputs,
    payload: publishResult.payload,
    changed: publishResult.changed,
    totalSource: publishResult.totalSource,
    chartResult,
  };

  setActionOutputs(result, writeOutput);
  appendRunSummary(result, writeSummary);

  if (publishResult.changed) {
    logger.log(
      `Published ${inputs.outputBranch}:${inputs.outputPath} for ${inputs.owner}/${inputs.repo} (total=${publishResult.payload.stats.total}, source=${publishResult.totalSource}, chart=${inputs.publishChart ? `${chartResult.publishedCount}/${chartResult.totalCount} updated` : "disabled"}).`,
    );
  } else {
    logger.log(
      `Skipped publish for ${inputs.owner}/${inputs.repo}; no material change detected (source=${publishResult.totalSource}, chart=${inputs.publishChart ? `${chartResult.publishedCount}/${chartResult.totalCount} updated` : "disabled"}).`,
    );
  }
}

if (require.main === module) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  run,
};
