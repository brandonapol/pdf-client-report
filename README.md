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

### Platform exports

A raw CSV export from GA4, Google Ads, Meta Ads Manager, or Mailchimp works as-is, with no cleanup. Preamble lines and `#` comment blocks are skipped, and only the first table is read. Each numeric column becomes a metric:

- If the export has a total row (`Total: Account`, `Grand total`), its values are used.
- A single-row export is taken as-is.
- Otherwise columns are summed across rows, but only columns that can be added. Rates, averages, cost-per, reach, users, results, IDs, dates and budgets are skipped rather than summed into a wrong number.

Pass the prior period's export as `previousCsv` to fill `previous` by metric name. A metric missing from it stays at no baseline.

Header aliases: `name`/`kpi` for `metric`, `current`/`this_week` for `value`, `prior`/`last_week` for `previous`, `notes` for `note`. Values may include `$`, `%` and thousands separators.

The PDF always fits on one page. Past about 20 metrics, the table ends with "+ N more metrics not shown".

## Local use

```bash
node src/cli.js examples/acme-weekly.csv Acme "Week of Sep 28"
```

That writes `acme-weekly-report.pdf` next to the working directory.

`mcp.json` points clients at the hosted endpoint below. To run the tools locally over stdio instead (one JSON-RPC message per line):

```bash
npm run stdio
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
- `GET /` is the plugin's website, the listing's `websiteURL`.
- `GET /healthz` returns `ok`.
- `GET /.well-known/openai-apps-challenge` returns `$OPENAI_APPS_CHALLENGE` for directory domain verification, and 404s when it is unset.
- `GET /stats` returns daily tool-call counts as JSON when `STATS_TOKEN` is set and sent as `Authorization: Bearer <token>`, and 404s otherwise. Counts only, never report contents; they reset on restart.
- `render_client_report_pdf` returns a `download_url` under `/files/` instead of base64. Links are held in memory, expire after 15 minutes, and only the newest 500 are kept. Set `PUBLIC_URL` if the host does not forward `X-Forwarded-Proto`.
- Each client gets 30 tool calls a minute, keyed on DigitalOcean's `do-connecting-ip` header. Past that, tool calls return a readable `isError` result saying when to retry.

## Plugin package

```bash
npm run package
```

That zips the committed manifests, `mcp.json`, and the skill into `dist/client-weekly-report-plugin.zip` for the ChatGPT plugin importer. Commit first; it packages `HEAD`.

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
