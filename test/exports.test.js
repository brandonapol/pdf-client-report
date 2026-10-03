import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseExport, readMetrics } from "../src/exports.js";
import { draftReport } from "../src/report.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/exports/${name}`, import.meta.url), "utf8");
const byName = (metrics) => Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));

test("sums additive ga4 columns and skips rates, averages, and later tables", () => {
  assert.deepEqual(byName(parseExport(fixture("ga4-traffic-acquisition.csv"))), {
    Sessions: 3350,
    "Engaged sessions": 2043,
    "Event count": 18262,
    "Key events": 43,
    "Total revenue": 1250.5,
  });
});

test("uses the platform's account total row when the export has one", () => {
  assert.deepEqual(byName(parseExport(fixture("google-ads-campaigns.csv"))), {
    Clicks: 1222,
    "Impr.": 24650,
    CTR: 4.96,
    "Avg. CPC": 0.9,
    Cost: 1097.94,
    Conversions: 40,
    "Cost / conv.": 27.45,
    "Conv. rate": 3.27,
  });
});

test("never sums reach, results, or cost-per columns across campaigns", () => {
  assert.deepEqual(byName(parseExport(fixture("meta-ads-campaigns.csv"))), {
    Impressions: 33910,
    "Amount spent (USD)": 167.76,
    "Link clicks": 407,
  });
});

test("ignores id and date columns in email exports", () => {
  const metrics = byName(parseExport(fixture("mailchimp-campaigns.csv")));
  assert.equal(metrics["Successful Deliveries"], 10290);
  assert.equal(metrics["Unique Opens"], 4000);
  assert.equal(metrics["Total Clicks"], 660);
  assert.equal(metrics["Open Rate"], undefined);
  assert.equal(metrics["Folder Id"], undefined);
  assert.equal(metrics["Send Date"], undefined);
});

test("takes every numeric column as-is from a single-row export", () => {
  assert.deepEqual(byName(parseExport("Account,Clicks,CTR\nAcme,120,3.1%\n")), { Clicks: 120, CTR: 3.1 });
});

test("returns null when nothing looks like a metrics table", () => {
  assert.equal(parseExport("just some notes\nnothing here"), null);
  assert.equal(parseExport(""), null);
});

test("fills previous from last week's export by metric name", () => {
  const metrics = readMetrics({ csv: fixture("google-ads-campaigns.csv"), previousCsv: fixture("google-ads-campaigns-previous.csv") });
  const clicks = metrics.find((metric) => metric.name === "Clicks");
  assert.equal(clicks.value, 1222);
  assert.equal(clicks.previous, 1100);
});

test("leaves previous null when last week's export lacks the metric", () => {
  const metrics = readMetrics({ csv: "Campaign,Clicks,Leads\nA,10,2\nB,5,1\n", previousCsv: "Campaign,Clicks\nA,8\n" });
  assert.deepEqual(
    metrics.map((metric) => [metric.name, metric.previous]),
    [
      ["Clicks", 8],
      ["Leads", null],
    ],
  );
});

test("keeps an explicit previous column over last week's export", () => {
  const metrics = readMetrics({ csv: "metric,value,previous\nLeads,4,2\nCalls,7,\n", previousCsv: "metric,value\nLeads,99\nCalls,0\n" });
  assert.deepEqual(
    metrics.map((metric) => [metric.name, metric.previous]),
    [
      ["Leads", 2],
      ["Calls", 0],
    ],
  );
});

test("drafts a report straight from a platform export with real deltas", () => {
  const report = draftReport({
    client: "Acme",
    period: "Week of Sep 21",
    csv: fixture("google-ads-campaigns.csv"),
    previousCsv: fixture("google-ads-campaigns-previous.csv"),
  });
  assert.equal(report.headline, "Conversions led the week, up 14%.");
  assert.equal(report.metrics.length, 8);
});

test("explains both accepted shapes when nothing parses", () => {
  assert.throws(() => draftReport({ csv: "hello" }), /metric,value.*platform export/s);
});
