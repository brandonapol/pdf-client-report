import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { draftReport } from "../src/report.js";
import { renderPdf } from "../src/pdf.js";

test("renders a one-page pdf with the client and headline", () => {
  const csv = readFileSync(new URL("../examples/acme-weekly.csv", import.meta.url), "utf8");
  const report = draftReport({ client: "Acme", period: "Week of Sep 28", csv });
  const pdf = renderPdf(report);
  const text = pdf.toString("latin1");

  assert.equal(text.startsWith("%PDF-1.4"), true);
  assert.match(text, /%%EOF$/);
  assert.match(text, /Acme/);
  assert.match(text, /Paid search sessions led the week/);
  assert.match(text, /What to do next/);
  assert.equal(text.includes("\n2 0 obj"), true);
});
