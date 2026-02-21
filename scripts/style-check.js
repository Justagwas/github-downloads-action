"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOTS = ["src", "tests", "compat", "scripts"];

function collectJsFiles(dir, output) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, output);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      output.push(fullPath);
    }
  }
}

function checkFile(filePath) {
  const issues = [];
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.includes("\t")) {
      issues.push(`${filePath}:${lineNumber} uses tab indentation`);
    }
    if (/[ \t]+$/.test(line)) {
      issues.push(`${filePath}:${lineNumber} has trailing whitespace`);
    }
  });

  if (!text.endsWith("\n")) {
    issues.push(`${filePath} is missing a trailing newline`);
  }

  return issues;
}

function main() {
  const files = [];
  for (const root of ROOTS) {
    if (fs.existsSync(root)) {
      collectJsFiles(root, files);
    }
  }

  const issues = [];
  for (const file of files.sort()) {
    issues.push(...checkFile(file));
  }

  if (issues.length > 0) {
    console.error("Style check failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Style check passed (${files.length} JavaScript files).`);
}

main();

