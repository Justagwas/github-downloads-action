"use strict";

function isSameRepositoryPayload(payload, owner, repo) {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.owner !== "string" || typeof payload.repo !== "string") return false;
  return (
    payload.owner.toLowerCase() === owner.toLowerCase() &&
    payload.repo.toLowerCase() === repo.toLowerCase()
  );
}

function getFreshCachedTotal(previousPayload, owner, repo, now, minRefreshMinutes) {
  if (minRefreshMinutes <= 0) return null;
  if (!isSameRepositoryPayload(previousPayload, owner, repo)) return null;

  const generatedAt = previousPayload.generatedAt;
  const total = previousPayload?.stats?.total;
  if (typeof generatedAt !== "string") return null;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) return null;

  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) return null;

  const ageMs = now.getTime() - generatedMs;
  if (ageMs < 0) return null;
  if (ageMs > minRefreshMinutes * 60_000) return null;

  return Math.floor(total);
}

module.exports = {
  getFreshCachedTotal,
  isSameRepositoryPayload,
};

