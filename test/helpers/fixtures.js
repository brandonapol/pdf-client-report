import { readFileSync } from "node:fs";

export const acmeCsv = readFileSync(new URL("../../examples/acme-weekly.csv", import.meta.url), "utf8");

export function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
}

export function metricsCsv(count) {
  let csv = "metric,value,previous\n";
  for (let i = 0; i < count; i += 1) csv += `Metric ${i},${i + 10},${i + 20}\n`;
  return csv;
}

// Every "x y Td" position in the content stream.
export function textPositions(pdf) {
  return [...pdf.toString("latin1").matchAll(/ (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Td/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
}
