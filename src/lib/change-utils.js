"use strict";

const { normalizeSeries } = require("./compute");

function parseJsonOrNull(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function extractPreviousSeries(existingContent, owner, repo, warn = () => {}) {
  if (!existingContent) return {};

  let parsed;
  try {
    parsed = JSON.parse(existingContent);
  } catch {
    warn("Existing output file is not valid JSON. Starting with a fresh snapshot series.");
    return {};
  }

  if (!parsed || typeof parsed !== "object") return {};

  if (
    typeof parsed.owner === "string" &&
    typeof parsed.repo === "string" &&
    (parsed.owner.toLowerCase() !== owner.toLowerCase() ||
      parsed.repo.toLowerCase() !== repo.toLowerCase())
  ) {
    warn(
      `Existing output belongs to ${parsed.owner}/${parsed.repo}. Starting a fresh series for ${owner}/${repo}.`,
    );
    return {};
  }

  return normalizeSeries(parsed?.snapshots?.series);
}

function normalizePayloadForNoop(payload) {
  if (!payload || typeof payload !== "object") return null;
  const clone = JSON.parse(JSON.stringify(payload));
  clone.generatedAt = "<ignored>";
  return clone;
}

function hasMaterialChange(previousPayload, nextPayload) {
  const prev = normalizePayloadForNoop(previousPayload);
  const next = normalizePayloadForNoop(nextPayload);
  if (!prev || !next) return true;
  return JSON.stringify(prev) !== JSON.stringify(next);
}

function hasTextChange(previousContent, nextContent) {
  const prev = typeof previousContent === "string" ? previousContent : "";
  const next = typeof nextContent === "string" ? nextContent : "";
  return prev !== next;
}

function isRetryableWriteConflict(error) {
  if (!error || typeof error !== "object") return false;
  const status = Number(error.status);
  if (status === 409) return true;
  if (status === 422 && /sha|conflict|update/i.test(String(error.message || ""))) return true;
  return false;
}

module.exports = {
  extractPreviousSeries,
  hasMaterialChange,
  hasTextChange,
  isRetryableWriteConflict,
  parseJsonOrNull,
};

