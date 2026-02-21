# Privacy Notice

Last updated: February 21, 2026

This notice explains how `justagwas/github-downloads-action` handles data.

## Short version

- This action reads repository release metadata from GitHub.
- It writes aggregated download stats (and optional charts) back to your repository.
- It is not designed to collect personal data.
- No external analytics or ad tracking is built into this action.

## What this action reads

When the workflow runs, it uses a GitHub token to call GitHub APIs for:

- repository metadata (owner/repo, branch info, visibility)
- releases and release assets
- release asset `download_count` values
- existing output files in the configured output branch/path

## What this action writes

It can publish:

- `downloads.json` snapshot data
- optional SVG chart files

These files are written to the repository path/branch you configure. If you publish to a public branch, the data becomes publicly accessible.

## What this action does not do

- It does not run its own telemetry service.
- It does not send repository data to third-party analytics providers.
- It does not sell data.
- It does not intentionally collect personal profile data from users.

## Data retention

Data retention is controlled by your repository:

- snapshots are kept according to `window_days`
- published files remain in your git history unless you rewrite history
- workflow logs are retained according to your GitHub Actions settings

## Third-party services

This action runs on GitHub Actions infrastructure and uses GitHub APIs. Their handling of data is governed by GitHub policies and your repository settings.

## Your responsibilities

If you use this action, you are responsible for:

- choosing what repository data is made public
- configuring permissions (`contents: write` when needed)
- providing any notices required by your own organization or law

## Contact

For privacy-related questions about this action, open an issue or follow `SUPPORT.md`.

