"use strict";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateUTC(dateString) {
  if (!DATE_RE.test(dateString)) {
    throw new Error(`Invalid snapshot date '${dateString}'. Expected YYYY-MM-DD.`);
  }
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid snapshot date '${dateString}'.`);
  }
  return date;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeSeries(series) {
  if (!series || typeof series !== "object" || Array.isArray(series)) return {};

  const normalized = {};
  for (const [date, value] of Object.entries(series)) {
    if (!DATE_RE.test(date)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    normalized[date] = Math.floor(value);
  }
  return normalized;
}

function sortSeries(series) {
  return Object.fromEntries(
    Object.entries(series).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function mergeSnapshots(existingSeries, todayDate, todayTotal, windowDays) {
  if (typeof todayTotal !== "number" || !Number.isFinite(todayTotal) || todayTotal < 0) {
    throw new Error(`Invalid total '${todayTotal}'. Expected a non-negative number.`);
  }

  const today = parseDateUTC(todayDate);
  const keepFrom = formatDateUTC(addDays(today, -(windowDays - 1)));
  const sanitized = normalizeSeries(existingSeries);
  sanitized[todayDate] = Math.floor(todayTotal);

  const kept = {};
  for (const [date, value] of Object.entries(sanitized)) {
    if (date >= keepFrom && date <= todayDate) {
      kept[date] = value;
    }
  }

  return sortSeries(kept);
}

function pickBaseline(entries, cutoffDate) {
  const exact = entries.find(([date]) => date === cutoffDate);
  if (exact) return { value: exact[1], partial: false };

  const after = entries.find(([date]) => date > cutoffDate);
  if (after) return { value: after[1], partial: true };

  const before = [...entries].reverse().find(([date]) => date < cutoffDate);
  if (before) return { value: before[1], partial: true };

  return null;
}

function computeRange(total, series, todayDate, days) {
  const today = parseDateUTC(todayDate);
  const cutoffDate = formatDateUTC(addDays(today, -days));
  const entries = Object.entries(series).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return { value: 0, partial: true };

  const baseline = pickBaseline(entries, cutoffDate);
  if (!baseline) return { value: 0, partial: true };

  return {
    value: Math.max(0, Math.floor(total) - Math.floor(baseline.value)),
    partial: baseline.partial,
  };
}

function computeStats(total, series, todayDate) {
  const day = computeRange(total, series, todayDate, 1);
  const week = computeRange(total, series, todayDate, 7);
  const month = computeRange(total, series, todayDate, 30);

  return {
    stats: {
      total: Math.floor(total),
      day: day.value,
      week: week.value,
      month: month.value,
    },
    partial: {
      day: day.partial,
      week: week.partial,
      month: month.partial,
    },
  };
}

function getSnapshotMeta(series, windowDays) {
  const dates = Object.keys(series).sort();
  return {
    windowDays,
    count: dates.length,
    firstDate: dates.length > 0 ? dates[0] : null,
    lastDate: dates.length > 0 ? dates[dates.length - 1] : null,
    series,
  };
}

function buildPayload({
  owner,
  repo,
  visibility,
  generatedAt,
  total,
  todayDate,
  windowDays,
  series,
  hourlyEnabled,
}) {
  const normalizedSeries = sortSeries(normalizeSeries(series));
  const { stats, partial } = computeStats(total, normalizedSeries, todayDate);

  return {
    schemaVersion: "1",
    owner,
    repo,
    visibility,
    generatedAt,
    stats,
    partial,
    snapshots: getSnapshotMeta(normalizedSeries, windowDays),
    profile: {
      defaultMode: hourlyEnabled ? "hourly" : "daily",
      hourlyEnabled,
    },
  };
}

module.exports = {
  formatDateUTC,
  mergeSnapshots,
  computeStats,
  buildPayload,
  normalizeSeries,
};
