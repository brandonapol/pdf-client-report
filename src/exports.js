import { number, parseMetricRows, parseRows } from "./csv.js";

// Ad and analytics exports are wide: one row per campaign or channel, one column per metric.
const TOTAL_ROW = /^(grand\s+)?totals?\b/i;
const ACCOUNT_TOTAL = /^(grand\s+)?total(:\s*account)?$/i;
// Labels and settings that happen to be numbers, never metrics.
const NOT_A_METRIC = /\bid\b|date|\bday\b|week|month|year|hour|starts|ends|budget/i;
// Adding these across rows gives a wrong number (rates, averages, unique people), so they only come from a platform total.
const NOT_ADDITIVE = /rate|%|ctr|avg|average|cost per|cost \/|cpc|cpm|cpa|roas|frequency|reach|users|position|score|duration|\bper\b|result|share/i;

export function readMetrics({ csv, rows, previousCsv } = {}) {
  const metrics = metricsFrom(rows ?? csv ?? "");
  if (!previousCsv) return metrics;
  const prior = new Map(metricsFrom(previousCsv).map((metric) => [metric.name.toLowerCase(), metric.value]));
  // Only fill gaps: an explicit previous column wins, and a metric missing last week stays null rather than 0.
  return metrics.map((metric) =>
    metric.previous == null && prior.has(metric.name.toLowerCase()) ? { ...metric, previous: prior.get(metric.name.toLowerCase()) } : metric,
  );
}

function metricsFrom(input) {
  const long = parseMetricRows(input);
  if (long.length > 0 || Array.isArray(input)) return long;
  return parseExport(input) ?? [];
}

export function parseExport(text) {
  const rows = parseRows(text);
  const start = rows.findIndex((row, index) => isHeader(row, rows[index + 1]));
  if (start === -1) return null;

  const header = rows[start];
  const body = [];
  for (const row of rows.slice(start + 1)) {
    if (row[0].startsWith("#")) break; // GA4 appends more tables after a comment block
    body.push(row);
  }
  const isTotal = (row) => row.slice(0, 3).some((cell) => TOTAL_ROW.test(cell));
  const totals = body.filter(isTotal);
  const data = body.filter((row) => !isTotal(row));
  const total = totals.find((row) => row.slice(0, 3).some((cell) => ACCOUNT_TOTAL.test(cell))) ?? totals[0];

  const metrics = [];
  header.forEach((name, column) => {
    if (!name || NOT_A_METRIC.test(name) || !isNumericColumn(data, column)) return;
    const value = columnValue(name, column, data, total);
    if (Number.isFinite(value)) metrics.push({ name, value, previous: null, unit: "", note: "" });
  });
  return metrics.length > 0 ? metrics : null;
}

function columnValue(name, column, data, total) {
  if (total) return number(total[column]);
  if (data.length === 1) return number(data[0][column]);
  if (NOT_ADDITIVE.test(name)) return NaN;
  return round(data.reduce((sum, row) => sum + (number(row[column]) || 0), 0));
}

// Every filled cell must be a number; "--" is how platforms print an empty one.
function isNumericColumn(data, column) {
  const cells = data.map((row) => row[column] ?? "").filter((cell) => cell !== "" && cell !== "--");
  return cells.length > 0 && cells.every((cell) => Number.isFinite(number(cell)));
}

function isHeader(row, next) {
  if (!next || row[0].startsWith("#") || row.filter(Boolean).length < 2) return false;
  const labels = row.filter((cell) => cell && !Number.isFinite(number(cell)));
  return labels.length === row.filter(Boolean).length && next.some((cell) => Number.isFinite(number(cell)));
}

// Summing currency floats leaves 1097.9400000000001; cents are as precise as these exports get.
function round(value) {
  return Math.round(value * 100) / 100;
}
