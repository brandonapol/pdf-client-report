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

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acmeCsv, metricsCsv, textPositions } from "./helpers/fixtures.js";

const acme = () => draftReport({ client: "Acme", period: "Week of Sep 28", csv: acmeCsv });

test("xref offsets point at each object and startxref points at the xref table", () => {
  const text = renderPdf(acme()).toString("latin1");
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF$/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const entries = text.slice(startxref).match(/^\d{10} 00000 n $/gm);
  assert.equal(entries.length, 6);
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`);
  });
});

test("stream length matches the bytes between stream and endstream", () => {
  const text = renderPdf(acme()).toString("latin1");
  const declared = Number(text.match(/\/Length (\d+)/)[1]);
  const start = text.indexOf("stream\n") + "stream\n".length;
  assert.equal(text.indexOf("\nendstream", start) - start, declared);
});

test("writes bullets and smart punctuation as WinAnsi bytes", () => {
  const report = { ...acme(), headline: "Clicks rose — “nice” … café" };
  const pdf = renderPdf(report);
  assert.ok(pdf.includes(Buffer.from([0x95, 0x20])), "bullet should be WinAnsi 0x95");
  assert.ok(pdf.includes(Buffer.from([0x97])), "em dash should be 0x97");
  assert.ok(pdf.includes(Buffer.from("caf\xe9", "latin1")));
  assert.ok(!pdf.includes(Buffer.from("•", "utf8")), "no UTF-8 multibyte sequences");
  assert.match(pdf.toString("latin1"), /\/Encoding \/WinAnsiEncoding/);
});

test("replaces characters Helvetica cannot draw instead of corrupting the file", () => {
  const pdf = renderPdf({ ...acme(), client: "Acme 🚀 東京" });
  assert.match(pdf.toString("latin1"), /\(Acme \? \?\?\) Tj/);
});

test("escapes parentheses and backslashes and strips control characters", () => {
  const pdf = renderPdf({ ...acme(), client: "A (B) \\ C\u0007" }).toString("latin1");
  assert.match(pdf, /\(A \\\(B\\\) \\\\ C\) Tj/);
});

test("keeps every line on the page even with many metrics and long text", () => {
  const report = draftReport({ client: "X".repeat(200), period: "W1", csv: metricsCsv(80) });
  report.moved = [Array(80).fill("word").join(" "), ...report.moved];
  const pdf = renderPdf(report);
  const positions = textPositions(pdf);
  assert.ok(positions.every(({ y }) => y >= 36 && y <= 792), "all text within the page");
  assert.match(pdf.toString("latin1"), /\+ \d+ more metrics not shown/);
});

test("renders a draft that went through json, as the render tool receives it", () => {
  const roundTripped = JSON.parse(JSON.stringify(acme()));
  assert.deepEqual(renderPdf(roundTripped), renderPdf(acme()));
});

test("rejects reports with the wrong shape with a clear message", () => {
  assert.throws(() => renderPdf(null), /report must be the object/);
  assert.throws(() => renderPdf([]), /report must be the object/);
  assert.throws(() => renderPdf({ client: "A", moved: "nope" }), /report\.moved must be an array/);
  assert.throws(() => renderPdf({ client: "A", metrics: [null] }), /report\.metrics\[0\] must be an object/);
  assert.throws(() => renderPdf({ client: { name: "A" } }), /must be strings or numbers/);
});

test("renders a minimal report with only a client", () => {
  assert.match(renderPdf({ client: "Solo" }).toString("latin1"), /\(Solo\) Tj/);
});

// Install qpdf to run this locally. CI sets REQUIRE_QPDF=1 so it cannot silently skip there.
const hasQpdf = spawnSync("qpdf", ["--version"]).status === 0;
test("passes qpdf structural checks", { skip: !hasQpdf && !process.env.REQUIRE_QPDF && "qpdf not installed" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "pdf-client-report-"));
  for (const [name, report] of [
    ["acme", acme()],
    ["long", draftReport({ client: "Long — “quoted” 🚀", period: "W1", csv: metricsCsv(80) })],
  ]) {
    const file = join(dir, `${name}.pdf`);
    writeFileSync(file, renderPdf(report));
    execFileSync("qpdf", ["--check", file], { stdio: "pipe" });
  }
});
