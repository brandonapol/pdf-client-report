const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

export function renderPdf(report) {
  const lines = layout(report);
  const stream = lines.map((line) => textOp(line)).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  return buildPdf(objects);
}

function layout(report) {
  const lines = [
    { font: "F2", size: 11, x: 48, y: 748, text: "CLIENT WEEKLY REPORT", color: "0.12 0.29 0.60" },
    { font: "F2", size: 22, x: 48, y: 716, text: report.client, color: "0.1 0.12 0.16" },
    { font: "F1", size: 11, x: 48, y: 694, text: report.period, color: "0.35 0.38 0.42" },
    { font: "F2", size: 13, x: 48, y: 656, text: clip(report.headline, 78), color: "0.1 0.12 0.16" },
    { font: "F2", size: 12, x: 48, y: 620, text: "What moved", color: "0.12 0.29 0.60" },
  ];
  let y = 598;
  for (const item of report.moved) {
    for (const wrapped of wrap(`• ${item}`, 88)) {
      lines.push({ font: "F1", size: 10, x: 48, y, text: wrapped, color: "0.15 0.16 0.18" });
      y -= 14;
    }
    y -= 4;
  }
  y -= 10;
  lines.push({ font: "F2", size: 12, x: 48, y, text: "What to do next", color: "0.12 0.29 0.60" });
  y -= 22;
  for (const item of report.next) {
    for (const wrapped of wrap(`• ${item}`, 88)) {
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
  for (const metric of report.metrics) {
    lines.push({ font: "F1", size: 10, x: 48, y, text: clip(metric.name, 34), color: "0.1 0.12 0.16" });
    lines.push({ font: "F1", size: 10, x: 300, y, text: metric.valueLabel, color: "0.1 0.12 0.16" });
    lines.push({ font: "F1", size: 10, x: 400, y, text: metric.changeLabel, color: "0.1 0.12 0.16" });
    y -= 16;
  }
  lines.push({
    font: "F1",
    size: 8,
    x: 48,
    y: 36,
    text: "Prepared for the Friday client send. Review the numbers before exporting.",
    color: "0.45 0.47 0.5",
  });
  return lines;
}

function textOp(line) {
  return `BT /${line.font} ${line.size} Tf ${line.color} rg ${line.x} ${line.y} Td (${escapePdf(line.text)}) Tj ET`;
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

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(objects) {
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

export const page = { PAGE_WIDTH, PAGE_HEIGHT };
