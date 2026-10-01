import assert from "node:assert/strict";
import test from "node:test";
import { change, formatNumber, formatPct, parseCsv, parseMetricRows } from "../src/csv.js";

test("parses escaped quotes inside quoted cells", () => {
  const rows = parseCsv('metric,note\nLeads,"said ""hi"", then left"\n');
  assert.equal(rows[0].note, 'said "hi", then left');
});

test("keeps newlines inside quoted cells", () => {
  const rows = parseCsv('metric,note\nLeads,"line one\nline two"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, "line one\nline two");
});

test("handles CRLF line endings, a BOM, and no trailing newline", () => {
  const rows = parseCsv("﻿metric,value\r\nLeads,4\r\nCalls,7");
  assert.deepEqual(rows, [
    { metric: "Leads", value: "4" },
    { metric: "Calls", value: "7" },
  ]);
});

test("lowercases and trims headers and skips blank lines", () => {
  const rows = parseCsv(" Metric , VALUE \n\n,\nLeads,4\n\n");
  assert.deepEqual(rows, [{ metric: "Leads", value: "4" }]);
});

test("fills short rows with empty strings", () => {
  assert.deepEqual(parseCsv("metric,value,previous\nLeads,4\n"), [{ metric: "Leads", value: "4", previous: "" }]);
});

test("returns no rows for empty or missing input", () => {
  assert.deepEqual(parseCsv(""), []);
  assert.deepEqual(parseCsv(undefined), []);
  assert.deepEqual(parseCsv("metric,value\n"), []);
});

test("accepts header aliases", () => {
  const [metric] = parseMetricRows("kpi,this_week,last_week,notes\nLeads,4,2,ok\n");
  assert.deepEqual(metric, { name: "Leads", value: 4, previous: 2, unit: "", note: "ok" });
});

test("cleans currency, percent, and thousands separators", () => {
  const rows = parseMetricRows('metric,value,previous\nRevenue,"$1,250.50","$1,000"\nCTR,4.5%,3%\nLoss,-12,-3\n');
  assert.deepEqual(
    rows.map((row) => [row.value, row.previous]),
    [
      [1250.5, 1000],
      [4.5, 3],
      [-12, -3],
    ],
  );
});

test("drops rows without a name or a numeric value", () => {
  const rows = parseMetricRows("metric,value\n,4\nLeads,\nCalls,lots\nVisits,12\n");
  assert.deepEqual(
    rows.map((row) => row.name),
    ["Visits"],
  );
});

test("treats a blank or non-numeric previous as no baseline, never zero", () => {
  const rows = parseMetricRows("metric,value,previous\nLeads,4,\nCalls,7,n/a\n");
  assert.deepEqual(
    rows.map((row) => row.previous),
    [null, null],
  );
});

test("accepts numeric values in json rows", () => {
  const [row] = parseMetricRows([{ metric: "Leads", value: 4, previous: 0 }]);
  assert.equal(row.value, 4);
  assert.equal(row.previous, 0);
});

test("change has no pct for a zero or missing baseline", () => {
  assert.deepEqual(change({ value: 5, previous: null }), { delta: null, pct: null });
  assert.deepEqual(change({ value: 5, previous: 0 }), { delta: 5, pct: null });
  assert.deepEqual(change({ value: 15, previous: 10 }), { delta: 5, pct: 0.5 });
});

test("formats numbers and percentages", () => {
  assert.equal(formatNumber(1840), "1,840");
  assert.equal(formatNumber(2.25), "2.3");
  assert.equal(formatNumber(NaN), "n/a");
  assert.equal(formatPct(0.519), "+52%");
  assert.equal(formatPct(-0.19), "-19%");
  assert.equal(formatPct(0), "0%");
  assert.equal(formatPct(null), "n/a");
});
