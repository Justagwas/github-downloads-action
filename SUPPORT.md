# Support

If you need help using `justagwas/github-downloads-action`, use one of these:

- Usage/setup questions: open a **Question** issue
- Bugs: open a **Bug report** issue
- Security concerns: do **not** open a public issue; see `.github/SECURITY.md`

## Before opening an issue

- Confirm your workflow includes:
  - `permissions: contents: write`
  - `with.token: ${{ secrets.GITHUB_TOKEN }}`
- Confirm your source URL returns JSON
- Check `README.md` troubleshooting section

## What to include

- Target repository (`owner/repo`)
- Workflow YAML snippet
- Exact error message/log lines
- Whether repo is public/private
