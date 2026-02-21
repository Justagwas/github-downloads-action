"use strict";

const API_BASE = "https://api.github.com";
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RATE_LIMIT_WAIT_MS = 300_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return null;

  const seconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RATE_LIMIT_WAIT_MS);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    const waitMs = retryAt - Date.now();
    return waitMs > 0 ? Math.min(waitMs, MAX_RATE_LIMIT_WAIT_MS) : null;
  }

  return null;
}

function parseRateLimitResetMs(response) {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (remaining !== "0" || !reset) return null;

  const resetEpoch = Number.parseInt(reset, 10);
  if (!Number.isFinite(resetEpoch)) return null;

  const waitMs = resetEpoch * 1000 - Date.now() + 500;
  return waitMs > 0 ? Math.min(waitMs, MAX_RATE_LIMIT_WAIT_MS) : null;
}

function computeBackoffMs(attempt, response) {
  const retryAfterMs = response ? parseRetryAfterMs(response) : null;
  if (retryAfterMs !== null) return retryAfterMs;

  const rateLimitMs = response ? parseRateLimitResetMs(response) : null;
  if (rateLimitMs !== null) return rateLimitMs;

  const base = 350;
  const exponential = base * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 180);
  return Math.min(exponential + jitter, 4_000);
}

function normalizeErrorDetail(text) {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // ignore
  }
  return text;
}

function createRequestError(message, noRetry = true, status = null) {
  const error = new Error(message);
  error.noRetry = noRetry;
  if (Number.isInteger(status)) error.status = status;
  return error;
}

function shouldRetryResponse(response) {
  if (RETRYABLE_STATUSES.has(response.status)) return true;
  if (parseRetryAfterMs(response) !== null) return true;
  if (parseRateLimitResetMs(response) !== null) return true;
  return false;
}

function createGitHubClient(token) {
  if (!token) throw new Error("Missing GITHUB_TOKEN.");

  async function request(method, pathname, { query, body, allowNotFound } = {}) {
    const url = new URL(`${API_BASE}${pathname}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
          response = await fetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "User-Agent": "justagwas/github-downloads-action",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (response.status === 404 && allowNotFound) return null;

        if (!response.ok) {
          const raw = await response.text();
          const detail = normalizeErrorDetail(raw);
          const retryable = shouldRetryResponse(response);
          if (retryable && attempt < maxAttempts) {
            await sleep(computeBackoffMs(attempt, response));
            continue;
          }

          throw createRequestError(
            `GitHub API ${method} ${pathname} failed (${response.status}): ${detail || "unknown error"}.`,
            true,
            response.status,
          );
        }

        if (response.status === 204) return null;

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return response.json();
        }
        return response.text();
      } catch (error) {
        if (error && error.noRetry) {
          throw error;
        }
        if (error && error.name === "AbortError" && attempt >= maxAttempts) {
          throw createRequestError(
            `GitHub API ${method} ${pathname} timed out after ${REQUEST_TIMEOUT_MS}ms.`,
            true,
          );
        }
        if (attempt >= maxAttempts) {
          throw error;
        }
        await sleep(computeBackoffMs(attempt, null));
      }
    }

    throw new Error(`GitHub API ${method} ${pathname} failed after retries.`);
  }

  function encodePath(path) {
    return path
      .split("/")
      .filter((part) => part.length > 0)
      .map(encodeURIComponent)
      .join("/");
  }

  async function getRepository(owner, repo) {
    return request("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  async function getReleaseDownloadsTotal(owner, repo) {
    let page = 1;
    let total = 0;

    while (true) {
      const releases = await request(
        "GET",
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
        { query: { per_page: 100, page } },
      );

      if (!Array.isArray(releases)) {
        throw new Error("Unexpected GitHub API response for releases list.");
      }

      for (const release of releases) {
        const assets = Array.isArray(release.assets) ? release.assets : [];
        for (const asset of assets) {
          const downloads = Number(asset.download_count);
          if (Number.isFinite(downloads) && downloads > 0) {
            total += Math.floor(downloads);
          }
        }
      }

      if (releases.length < 100) break;
      page += 1;
      if (page > 1000) {
        throw new Error("Release pagination exceeded safety limit (1000 pages).");
      }
    }

    return total;
  }

  async function getRef(owner, repo, branch, allowNotFound = false) {
    return request(
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
      { allowNotFound },
    );
  }

  async function createRef(owner, repo, branch, sha) {
    return request("POST", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, {
      body: {
        ref: `refs/heads/${branch}`,
        sha,
      },
    });
  }

  async function ensureBranch(owner, repo, branch, defaultBranch) {
    const existing = await getRef(owner, repo, branch, true);
    if (existing) return;

    const sourceRef = await getRef(owner, repo, defaultBranch, false);
    const sourceSha = sourceRef?.object?.sha;
    if (!sourceSha) {
      throw new Error(
        `Could not resolve SHA for default branch '${defaultBranch}' while creating '${branch}'.`,
      );
    }

    await createRef(owner, repo, branch, sourceSha);
  }

  async function getFile(owner, repo, path, branch) {
    const data = await request(
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`,
      {
        query: { ref: branch },
        allowNotFound: true,
      },
    );

    if (!data) return null;
    if (Array.isArray(data)) {
      throw new Error(
        `Expected file at '${path}' on branch '${branch}', but a directory was found.`,
      );
    }

    if (data.type !== "file") {
      throw new Error(`Expected file at '${path}' on branch '${branch}', got type '${data.type}'.`);
    }

    const content =
      typeof data.content === "string"
        ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
        : "";

    return { sha: data.sha, content };
  }

  async function putFile(owner, repo, path, branch, content, message, sha) {
    return request(
      "PUT",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`,
      {
        body: {
          message,
          branch,
          content: Buffer.from(content, "utf8").toString("base64"),
          sha,
        },
      },
    );
  }

  return {
    ensureBranch,
    getFile,
    getRepository,
    getReleaseDownloadsTotal,
    putFile,
  };
}

module.exports = {
  createGitHubClient,
};
