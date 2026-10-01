const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FOOTER_Y = 36;
const BOTTOM_Y = 60;
const MAX_LINES_PER_ITEM = 3;

// Helvetica is a standard Type1 font, so text must be WinAnsi bytes, not UTF-8.
const WIN_ANSI_EXTRAS = new Map([
  ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85], ["†", 0x86], ["‡", 0x87],
  ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a], ["‹", 0x8b], ["Œ", 0x8c], ["Ž", 0x8e], ["‘", 0x91],
  ["’", 0x92], ["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96], ["—", 0x97], ["˜", 0x98],
  ["™", 0x99], ["š", 0x9a], ["›", 0x9b], ["œ", 0x9c], ["ž", 0x9e], ["Ÿ", 0x9f],
]);

export function renderPdf(input) {
  const lines = layout(normalizeReport(input));
  const stream = lines.map((line) => textOp(line)).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  return buildPdf(objects);
}

// The render tool takes a draft the user may have edited, so check its shape here.
export function normalizeReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("report must be the object returned by draft_client_report");
  }
  const list = (key) => {
    const value = report[key] ?? [];
    if (!Array.isArray(value)) throw new Error(`report.${key} must be an array`);
    return value.map((item) => text(item)).filter(Boolean);
  };
  const metrics = report.metrics ?? [];
  if (!Array.isArray(metrics)) throw new Error("report.metrics must be an array");
  return {
    client: text(report.client) || "Client",
    period: text(report.period),
    headline: text(report.headline),
    moved: list("moved"),
    next: list("next"),
    metrics: metrics.map((metric, index) => {
      if (!metric || typeof metric !== "object") throw new Error(`report.metrics[${index}] must be an object`);
      return {
        name: text(metric.name),
        valueLabel: text(metric.valueLabel ?? metric.value),
        changeLabel: text(metric.changeLabel),
      };
    }),
  };
}

function text(value) {
  if (value == null) return "";
  if (typeof value === "object") throw new Error("report text fields must be strings or numbers");
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function layout(report) {
  const lines = [
    { font: "F2", size: 11, x: 48, y: 748, text: "CLIENT WEEKLY REPORT", color: "0.12 0.29 0.60" },
    { font: "F2", size: 22, x: 48, y: 716, text: clip(report.client, 40), color: "0.1 0.12 0.16" },
    { font: "F1", size: 11, x: 48, y: 694, text: clip(report.period, 80), color: "0.35 0.38 0.42" },
    { font: "F2", size: 13, x: 48, y: 656, text: clip(report.headline, 78), color: "0.1 0.12 0.16" },
    { font: "F2", size: 12, x: 48, y: 620, text: "What moved", color: "0.12 0.29 0.60" },
  ];
  let y = 598;
  for (const item of report.moved) {
    for (const wrapped of bulletLines(item)) {
      lines.push({ font: "F1", size: 10, x: 48, y, text: wrapped, color: "0.15 0.16 0.18" });
      y -= 14;
    }
    y -= 4;
  }
  y -= 10;
  lines.push({ font: "F2", size: 12, x: 48, y, text: "What to do next", color: "0.12 0.29 0.60" });
  y -= 22;
  for (const item of report.next) {
    for (const wrapped of bulletLines(item)) {
      lines.push({ font: "F1", size: 10, x: 48, y, text: wrapped, color: "0.15 0.16 0.18" });
      y -= 14;
    }
    y -= 4;
  }
  y -= 12;
  lines.push({ font: "F2", size: 12, x: 48, y, text: "Metrics", color: "0.12 0.29 0.60" });
  y -= 20;
  lines.push({ font: "F2", size: 9, x: 48, y, text: "Metric", color: "0.35 0.38 0.42" });
  lines.push({ font: "F2", size: 9, x: 300, y, text: "This week", color: "0.35 0.38 0.42" });
  lines.push({ font: "F2", size: 9, x: 400, y, text: "Change", color: "0.35 0.38 0.42" });
  y -= 16;
  for (const [index, metric] of report.metrics.entries()) {
    if (y < BOTTOM_Y + 16 && index < report.metrics.length - 1) {
      const rest = report.metrics.length - index;
      lines.push({ font: "F1", size: 9, x: 48, y, text: `+ ${rest} more metrics not shown`, color: "0.45 0.47 0.5" });
      break;
    }
    lines.push({ font: "F1", size: 10, x: 48, y, text: clip(metric.name, 34), color: "0.1 0.12 0.16" });
    lines.push({ font: "F1", size: 10, x: 300, y, text: clip(metric.valueLabel, 18), color: "0.1 0.12 0.16" });
    lines.push({ font: "F1", size: 10, x: 400, y, text: clip(metric.changeLabel, 24), color: "0.1 0.12 0.16" });
    y -= 16;
  }
  lines.push({
    font: "F1",
    size: 8,
    x: 48,
    y: FOOTER_Y,
    text: "Prepared for the Friday client send. Review the numbers before exporting.",
    color: "0.45 0.47 0.5",
  });
  return lines;
}

function textOp(line) {
  return `BT /${line.font} ${line.size} Tf ${line.color} rg ${line.x} ${line.y} Td (${escapePdf(line.text)}) Tj ET`;
}

function bulletLines(item) {
  const wrapped = wrap(`• ${item}`, 88);
  if (wrapped.length <= MAX_LINES_PER_ITEM) return wrapped;
  const kept = wrapped.slice(0, MAX_LINES_PER_ITEM);
  kept[kept.length - 1] = clip(`${kept[kept.length - 1]} …`, 88);
  return kept;
}

function wrap(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function clip(text, width) {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

// Returns a binary string: one char per byte, ready to write as latin1.
function escapePdf(value) {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (char === "\\" || char === "(" || char === ")") out += `\\${char}`;
    else if (code < 0x20 || code === 0x7f) out += " ";
    else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) out += char;
    else out += String.fromCharCode(WIN_ANSI_EXTRAS.get(char) ?? 0x3f);
  }
  return out;
}

function buildPdf(objects) {
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

export const page = { PAGE_WIDTH, PAGE_HEIGHT };
