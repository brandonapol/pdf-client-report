#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { draftReport } from "./report.js";
import { renderPdf } from "./pdf.js";

const [csvPath, client = "Client", period = ""] = process.argv.slice(2);
if (!csvPath) {
  console.error("Usage: node src/cli.js <metrics.csv> [client] [period]");
  process.exit(1);
}

const report = draftReport({
  client,
  period,
  csv: readFileSync(csvPath, "utf8"),
});
const pdf = renderPdf(report);
const out = `${client.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-weekly-report.pdf`;
writeFileSync(out, pdf);
console.log(JSON.stringify({ file: out, headline: report.headline, next: report.next }, null, 2));
