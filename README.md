# Client Weekly Report

ChatGPT plugin that turns a metrics CSV into this week's client report. It is not a generic PDF maker. It ranks week-over-week movers, writes what to do next, and exports a one-page Friday PDF after review.

Trigger phrases the skill listens for:

- write this week's client report
- Friday client report
- turn this CSV into a client report

## CSV

```csv
metric,value,previous,unit,note
Paid search sessions,1840,1210,sessions,Brand campaign launched Tuesday
Email clicks,210,260,clicks,Send went out late
```

`metric` and `value` are required. `previous` is what makes the delta real. Missing priors are reported as no baseline, not guessed. A prior of `0` is reported as new from 0.

Header aliases: `name`/`kpi` for `metric`, `current`/`this_week` for `value`, `prior`/`last_week` for `previous`, `notes` for `note`. Values may include `$`, `%` and thousands separators.

The PDF always fits on one page. Past about 20 metrics, the table ends with "+ N more metrics not shown".

## Local use

```bash
node src/cli.js examples/acme-weekly.csv Acme "Week of Sep 28"
```

That writes `acme-weekly-report.pdf` next to the working directory.

Codex and ChatGPT developer mode can launch the stdio server from `mcp.json`. It speaks MCP stdio: one JSON-RPC message per line.

```bash
node src/server.js
```

Tools:

- `draft_client_report` returns the headline, movers, next actions, and table.
- `render_client_report_pdf` renders the confirmed draft.

## Hosted endpoint

ChatGPT connects over streamable HTTP, not stdio:

```bash
npm start   # node src/http.js, listens on $PORT (default 8080)
```

- `POST /mcp` is the MCP endpoint.
- `GET /healthz` returns `ok`.
- `render_client_report_pdf` returns a `download_url` under `/files/` instead of base64. Links are held in memory and expire after 15 minutes. Set `PUBLIC_URL` if the host does not forward `X-Forwarded-Proto`.

## Directory submission

Public listing needs the hosted endpoint on a domain you verify. Do not point the directory at a placeholder URL.

## Development

Node 22 or newer. There are no runtime dependencies and nothing to install.

```bash
npm test                # unit and integration tests
npm run test:coverage   # fails under 90% lines, 85% branches, 85% functions
npm run check           # syntax check
```

Install `qpdf` so the PDF structure test runs instead of skipping. Coding agents should read [AGENTS.md](AGENTS.md) for the rules that keep the plugin working.

## CI

`.github/workflows/ci.yml` runs on pushes to `main`, on every pull request, and on demand.

- **test** on Node 22 and 24: syntax check, the full test suite with `qpdf` required, and the coverage gate on Node 24.
- **smoke**: starts the real stdio and HTTP servers, runs a draft and render round trip over HTTP, downloads the PDF, and runs the CLI against the example.

Protect `main` so both jobs must pass before merging.

## Git

`main` is the release branch. Work on a branch and open a pull request.
