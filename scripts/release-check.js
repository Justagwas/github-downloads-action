"use strict";

const fs = require("node:fs");

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(errors, filePath, needle, label) {
  const text = readText(filePath);
  if (!text.includes(needle)) {
    errors.push(`${filePath} missing ${label}: ${needle}`);
  }
}

function main() {
  const errors = [];

  const requiredFiles = [
    "README.md",
    "action.yml",
    "src/lib/chart-config.js",
    "EULA.md",
    "PRIVACY.md",
    "templates/workflows/gh-dl-daily.yml",
    "templates/workflows/gh-dl-hourly.yml",
    "templates/workflows/gh-dl-daily-with-chart.yml",
  ];

  for (const filePath of requiredFiles) {
    if (!fileExists(filePath)) {
      errors.push(`Missing required file: ${filePath}`);
    }
  }

  if (fileExists("action.yml")) {
    assertIncludes(errors, "action.yml", "chart_date_label_format", "chart date format input");
    assertIncludes(errors, "action.yml", "chart_show_generated_at", "generated footer input");
    assertIncludes(errors, "action.yml", "chart_title_mode", "title mode input");
    assertIncludes(errors, "action.yml", "chart_title_text", "custom title input");
  }

  if (fileExists("src/lib/chart.js")) {
    assertIncludes(
      errors,
      "src/lib/chart.js",
      'require("./chart-config")',
      "shared chart config import",
    );
  }

  if (fileExists("README.md")) {
    assertIncludes(
      errors,
      "README.md",
      "https://justagwas.com/projects/gda#generator-lab",
      "generator lab link",
    );
    assertIncludes(errors, "README.md", "chart_date_label_format", "chart date format docs");
    assertIncludes(errors, "README.md", "chart_show_generated_at", "generated footer docs");
    assertIncludes(errors, "README.md", "chart_title_mode", "title mode docs");
    assertIncludes(errors, "README.md", "chart_title_text", "custom title docs");
  }

  if (fileExists("templates/workflows/gh-dl-daily-with-chart.yml")) {
    assertIncludes(
      errors,
      "templates/workflows/gh-dl-daily-with-chart.yml",
      'publish_chart: "true"',
      "chart workflow publishing",
    );
  }

  if (errors.length > 0) {
    console.error("Release checks failed:");
    for (const issue of errors) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Release checks passed.");
}

main();
