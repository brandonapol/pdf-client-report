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

1. Get the client name and the metrics CSV. Required columns are `metric` and `value`. Optional columns are `previous`, `unit`, and `note`.
2. Call `draft_client_report`. Do not invent the deltas.
3. Show the headline, what moved, and what to do next. Ask the user to correct anything before export.
4. Call `render_client_report_pdf` with the confirmed draft.
5. Return the PDF as `client-weekly-report.pdf`. Do not paste the base64 into the chat.

If a prior week is missing, say so. Do not fill the gap with a guess.
