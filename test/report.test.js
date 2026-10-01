import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseCsv, parseMetricRows } from "../src/csv.js";
import { draftReport } from "../src/report.js";

test("parses quoted csv cells", () => {
  const rows = parseCsv('metric,note\n"Paid, search","launched, tuesday"\n');
  assert.equal(rows[0].metric, "Paid, search");
  assert.equal(rows[0].note, "launched, tuesday");
});

test("drafts the friday report from the sample export", () => {
  const csv = readFileSync(new URL("../examples/acme-weekly.csv", import.meta.url), "utf8");
  const report = draftReport({ client: "Acme", period: "Week of Sep 28", csv });

  assert.equal(report.client, "Acme");
  assert.equal(report.headline, "Paid search sessions led the week, up 52%.");
  assert.equal(report.moved.length, 3);
  assert.match(report.moved[0], /Paid search sessions up 52%/);
  assert.ok(report.next.some((line) => line.includes("Email clicks")));
  assert.equal(report.metrics[0].changeLabel, "+52%");
});

test("rejects an export with no metrics", () => {
  assert.throws(() => draftReport({ csv: "metric,value\n" }), /No metrics found/);
});

test("accepts json rows and missing baselines", () => {
  const rows = parseMetricRows([{ metric: "Leads", value: "4" }]);
  const report = draftReport({ client: "North", rows });
  assert.equal(report.metrics[0].changeLabel, "no baseline");
  assert.match(report.next[0], /baseline/);
});
