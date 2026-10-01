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

`metric` and `value` are required. `previous` is what makes the delta real. Missing priors are reported as no baseline, not guessed.

## Local use

```bash
node src/cli.js examples/acme-weekly.csv Acme "Week of Sep 28"
```

That writes `acme-weekly-report.pdf` next to the working directory.

`mcp.json` points clients at the hosted endpoint below. To run the tools locally over stdio instead:

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
- `GET /healthz` returns `ok`.
- `render_client_report_pdf` returns a `download_url` under `/files/` instead of base64. Links are held in memory and expire after 15 minutes. Set `PUBLIC_URL` if the host does not forward `X-Forwarded-Proto`.

## Plugin package

```bash
npm run package
```

That zips the committed manifests, `mcp.json`, and the skill into `dist/client-weekly-report-plugin.zip` for the ChatGPT plugin importer. Commit first; it packages `HEAD`.

## Directory submission

Public listing needs the hosted endpoint on a domain you verify. Do not point the directory at a placeholder URL.

## Git

`main` is the release branch. CI runs `npm test` on every push and pull request. There are no runtime dependencies.
