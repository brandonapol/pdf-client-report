# AGENTS.md

Guidance for coding agents (Codex, Claude Code, and others) working in this repo. Read it before changing anything. Humans should read README.md first.

## What this is

A ChatGPT/Codex plugin that turns a metrics CSV into a one-page Friday client report PDF. It exposes two MCP tools, `draft_client_report` and `render_client_report_pdf`, over stdio (`src/server.js`) and streamable HTTP (`src/http.js`). It is not a general PDF maker; don't add features that would make it one.

## Map

| Path | Role |
| --- | --- |
| `src/csv.js` | CSV parsing, number cleanup, `change()`, formatting |
| `src/report.js` | `draftReport()`: ranks movers, writes headline, moved lines, next actions |
| `src/pdf.js` | `renderPdf()`: validates the draft, hand-writes a one-page PDF 1.4 |
| `src/server.js` | MCP JSON-RPC handler (`handleMessage`) and the stdio transport |
| `src/http.js` | Streamable HTTP transport, `/mcp`, `/healthz`, expiring `/files/` links, the `/` website, the OpenAI domain challenge, per-client rate limits, and token-gated `/stats` counts |
| `src/entry.js` | `isEntryPoint()`, so scripts start when launched through a symlink |
| `src/cli.js` | Local CLI that writes `<client>-weekly-report.pdf` |
| `skills/client-weekly-report/SKILL.md` | Instructions the host model follows |
| `plugin.json`, `.codex-plugin/plugin.json` | Directory manifest. The two files must be identical |
| `mcp.json` | Points the plugin at the hosted streamable HTTP endpoint on DigitalOcean |
| `ui/review.html` | `ui://client-report/review` resource |
| `ui/site.html` | Public website served at `/`, the listing's `websiteURL` |
| `test/` | `node:test` suites, one per module plus `stdio`, `cli`, `manifest` |

## Commands

```bash
npm test                 # all tests, must pass before every commit
npm run test:coverage    # same, fails under 90% lines / 85% branches / 85% functions
npm run check            # syntax check every src file
npm run stdio            # stdio MCP server
npm start                # HTTP MCP server on $PORT (default 8080)
npm run report -- examples/acme-weekly.csv Acme "Week of Sep 28"
```

Install `qpdf` locally so the PDF structure test runs instead of skipping. CI sets `REQUIRE_QPDF=1`, so it cannot skip there.

## Rules that must hold

These are the things that break the plugin in ChatGPT. Each has a test; keep it passing.

1. **No runtime dependencies.** Node built-ins only. Dev tooling is fine but `dependencies` stays empty (`test/manifest.test.js`).
2. **stdout belongs to the protocol.** In `src/server.js` never `console.log`; the stdio transport is one JSON-RPC message per line, no `Content-Length` headers. Log to stderr (`test/stdio.test.js`).
3. **Never invent numbers.** A missing or non-numeric `previous` is `null` and shows as "no baseline". A `previous` of `0` is a real baseline and shows as "new from 0". Never default a missing value to 0 (`test/csv.test.js`, `test/report.test.js`).
4. **One page, always.** Every text position stays between y=36 and y=792. Long lists are truncated with "+ N more metrics not shown"; long text is wrapped and clipped (`test/pdf.test.js`).
5. **PDF text is WinAnsi bytes.** Helvetica is a standard Type1 font. Build the PDF as a latin1 binary string, map characters through `WIN_ANSI_EXTRAS`, replace anything else with `?`. Never write UTF-8 into the content stream, and compute offsets in bytes.
6. **The render tool trusts nothing.** `render_client_report_pdf` receives a draft the user or model may have edited. `normalizeReport()` validates its shape and coerces every field to text.
7. **Tool failures are results, not protocol errors.** Bad tool input returns `{ isError: true, content: [...] }` so the model can see why and retry. Only an unknown tool (`-32602`) or method (`-32601`) is a JSON-RPC error.
8. **Versions move together.** `package.json`, both `plugin.json` files and `SERVER.version` in `src/server.js` share one version (`test/manifest.test.js`).
9. **The skill and the tools agree.** If you rename a tool or change its output, update `SKILL.md` in the same change.

## Making changes

- Write the failing test first, then the fix. Every bug fix gets a regression test named after the behavior, not the bug.
- Keep the code style: ES modules, two-space indent, double quotes, small named functions, short comments that say why rather than what.
- Changing tool schemas or descriptions changes what ChatGPT sees. Call it out in the PR description.
- Don't touch `examples/acme-weekly.csv` without updating the exact-string tests that depend on it.
- Work on a branch; `main` is the release branch and CI runs on every PR.

## Releasing

1. Bump the version in `package.json`, `plugin.json`, `.codex-plugin/plugin.json` and `src/server.js`.
2. `npm run test:coverage` passes locally, and CI is green on the PR.
3. Deploy `npm start` behind HTTPS with `PUBLIC_URL` set, then hit `/healthz` and run one draft-and-render round trip against the live `/mcp`.
4. Only then update the directory listing. Never point it at a placeholder URL.
