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

test("ranks movers by absolute percent change", () => {
  const report = draftReport({
    client: "Acme",
    period: "W1",
    csv: "metric,value,previous\nSmall,105,100\nBig drop,40,100\nMedium,130,100\n",
  });
  assert.deepEqual(
    report.metrics.map((metric) => metric.name),
    ["Big drop", "Medium", "Small"],
  );
  assert.equal(report.headline, "Big drop led the week, down 60%.");
  assert.match(report.moved[0], /^Big drop down 60% to 40\.$/);
});

test("suggests investigating drops and keeping lifts, at most three actions", () => {
  const report = draftReport({
    client: "Acme",
    period: "W1",
    csv: "metric,value,previous\nA,50,100\nB,200,100\nC,10,\nD,1,100\nE,500,100\n",
  });
  assert.deepEqual(report.next, [
    "Keep the budget or effort that lifted E.",
    "Keep the budget or effort that lifted B.",
    "Investigate the drop in D before next week's send.",
  ]);
});

test("holds the mix when nothing moved more than 10%", () => {
  const report = draftReport({ client: "Acme", period: "W1", csv: "metric,value,previous\nA,101,100\nB,98,100\n" });
  assert.deepEqual(report.next, ["Hold the current mix. No metric moved more than 10%."]);
});

test("reports a zero baseline as new, not missing", () => {
  const report = draftReport({ client: "Acme", period: "W1", csv: "metric,value,previous,unit\nLeads,5,0,leads\nCalls,0,0,\n" });
  const byName = Object.fromEntries(report.metrics.map((metric) => [metric.name, metric]));
  assert.equal(byName.Leads.changeLabel, "new from 0");
  assert.equal(byName.Calls.changeLabel, "0%");
  assert.ok(report.moved.includes("Leads went from 0 to 5 leads."));
  assert.ok(!report.next.some((line) => line.includes("baseline")));
});

test("never invents a delta for a missing baseline", () => {
  const report = draftReport({ client: "Acme", period: "W1", csv: "metric,value,previous\nLeads,5,\n" });
  const [metric] = report.metrics;
  assert.equal(metric.previous, null);
  assert.equal(metric.delta, null);
  assert.equal(metric.pct, null);
  assert.equal(report.headline, "Leads is the lead metric this week.");
  assert.equal(report.moved[0], "Leads is 5 with no prior week.");
});

test("appends units and notes to the moved lines", () => {
  const report = draftReport({ client: "Acme", period: "W1", csv: "metric,value,previous,unit,note\nClicks,210,260,clicks,Send went out late\n" });
  assert.equal(report.moved[0], "Clicks down 19% to 210 clicks. Send went out late");
  assert.equal(report.metrics[0].valueLabel, "210 clicks");
});

test("trims inputs and falls back to a default client and period", () => {
  const report = draftReport({ client: "  ", csv: "metric,value\nLeads,4\n", preparedFor: " Dana " });
  assert.equal(report.client, "Client");
  assert.match(report.period, /^Week of [A-Z][a-z]{2} \d{1,2}$/);
  assert.equal(report.preparedFor, "Dana");
});

test("prefers explicit rows over csv text", () => {
  const report = draftReport({ client: "A", period: "W1", csv: "metric,value\nFromCsv,1\n", rows: [{ metric: "FromRows", value: 2 }] });
  assert.equal(report.metrics[0].name, "FromRows");
});

test("draft output is plain json that round-trips", () => {
  const report = draftReport({ client: "Acme", period: "Week of Sep 28", csv: readFileSync(new URL("../examples/acme-weekly.csv", import.meta.url), "utf8") });
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test("asks for missing baselines once instead of once per metric", () => {
  const report = draftReport({ csv: "metric,value\nOpens,10\nClicks,4\nBounces,2\nUnsubscribes,1\n" });
  assert.deepEqual(report.next, ["Add a prior-week baseline for Opens, Clicks and 2 more metrics before the next report."]);
  const two = draftReport({ csv: "metric,value,previous\nOpens,10,\nClicks,4,\nLeads,9,6\n" });
  assert.deepEqual(two.next, ["Keep the budget or effort that lifted Leads.", "Add a prior-week baseline for Opens and Clicks before the next report."]);
});
