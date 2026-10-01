const NUMBER = /^-?\d+(?:\.\d+)?$/;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const source = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.toLowerCase());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
}

export function parseMetricRows(input) {
  const records = Array.isArray(input) ? input : parseCsv(input);
  return records
    .map((record) => normalizeMetric(record))
    .filter((metric) => metric.name && Number.isFinite(metric.value));
}

function normalizeMetric(record) {
  const name = first(record, ["metric", "name", "kpi"]);
  const value = number(first(record, ["value", "current", "this_week"]));
  const previousRaw = first(record, ["previous", "prior", "last_week"]);
  const previous = previousRaw === "" ? null : number(previousRaw);
  return {
    name,
    value,
    previous: Number.isFinite(previous) ? previous : null,
    unit: first(record, ["unit"]) || "",
    note: first(record, ["note", "notes"]) || "",
  };
}

function first(record, keys) {
  for (const key of keys) {
    if (record[key] != null && String(record[key]).trim() !== "") {
      return String(record[key]).trim();
    }
  }
  return "";
}

function number(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "").replace(/[%,$\s]/g, "").replace(/,/g, "");
  if (!NUMBER.test(cleaned)) return NaN;
  return Number(cleaned);
}

export function change(metric) {
  if (metric.previous == null) return { delta: null, pct: null };
  const delta = metric.value - metric.previous;
  const pct = metric.previous === 0 ? null : delta / metric.previous;
  return { delta, pct };
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function formatPct(pct) {
  if (pct == null) return "n/a";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${Math.round(pct * 100)}%`;
}
