---
name: client-weekly-report
description: Write this week's client report, the Friday client PDF, or turn a metrics CSV into a one-page client report. Use when the user asks for a weekly client report, client update PDF, Friday report, or to turn analytics or a CSV into a client-ready one-pager.
---

# Client weekly report

Use this skill only for a recurring client one-pager built from metrics. Do not use it to typeset an arbitrary document.

## Trigger phrases

Activate on phrases like:

- write this week's client report
- Friday client report
- weekly client PDF
- turn this CSV into a client report
- client one-pager

## Workflow

1. Get the client name and the metrics CSV. Either shape works:
   - A simple CSV with `metric` and `value`, and optional `previous`, `unit`, and `note`.
   - A raw export from GA4, Google Ads, Meta Ads, or Mailchimp, passed unchanged as `csv`. Do not reshape it yourself.
2. If the user has last week's export too, pass it unchanged as `previousCsv`. If they don't, ask once whether they can export the prior period, because without it nothing has a baseline.
3. Call `draft_client_report`. Do not invent the deltas.
4. Show the headline, what moved, and what to do next. Ask the user to correct anything before export.
5. Call `render_client_report_pdf` with the confirmed draft.
6. If the result has a `download_url`, give the user that link and say it expires in 15 minutes. Otherwise save the PDF under the `filename` the tool returns, such as `acme-weekly-report.pdf`. Do not paste the base64 into the chat.

If a tool result has `isError: true`, tell the user what was wrong with the input in plain words and ask for the fix. Do not retry with made-up data.

If a prior week is missing, say so. Do not fill the gap with a guess.
