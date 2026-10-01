#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { draftReport } from "./report.js";
import { renderPdf } from "./pdf.js";

const SERVER = { name: "pdf-client-report", version: "0.1.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const tools = [
  {
    name: "draft_client_report",
    description:
      "Draft this week's client report from a metrics CSV. Returns the headline, what moved, what to do next, and the metric table. Does not render the PDF.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client name, such as Acme." },
        period: { type: "string", description: "Report period, such as Week of Sep 28." },
        csv: { type: "string", description: "CSV with metric,value and optional previous,unit,note columns." },
        preparedFor: { type: "string", description: "Optional recipient." },
      },
      required: ["client", "csv"],
    },
    annotations: READ_ONLY,
  },
  {
    name: "render_client_report_pdf",
    description:
      "Render an already drafted client report as a one-page Friday PDF. Pass the draft JSON. Returns a download link, or base64 PDF bytes when run locally.",
    inputSchema: {
      type: "object",
      properties: {
        report: { type: "object", description: "Draft returned by draft_client_report." },
      },
      required: ["report"],
    },
    annotations: READ_ONLY,
  },
];

export function handleMessage(message, options = {}) {
  if (!message || message.jsonrpc !== "2.0") return null;
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    return null;
  }
  if (message.id == null) return null;

  try {
    if (message.method === "initialize") {
      return result(message.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(message.params?.protocolVersion)
          ? message.params.protocolVersion
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {}, resources: {} },
        serverInfo: SERVER,
      });
    }
    if (message.method === "ping") return result(message.id, {});
    if (message.method === "tools/list") return result(message.id, { tools });
    if (message.method === "tools/call") return result(message.id, callTool(message.params ?? {}, options));
    if (message.method === "resources/list") {
      return result(message.id, {
        resources: [
          {
            uri: "ui://client-report/review",
            name: "Report review",
            mimeType: "text/html",
          },
        ],
      });
    }
    if (message.method === "resources/read") {
      return result(message.id, readResource(message.params ?? {}));
    }
    return error(message.id, -32601, `Method not found: ${message.method}`);
  } catch (err) {
    return error(message.id, -32000, err.message);
  }
}

function callTool({ name, arguments: args = {} }, { publishPdf }) {
  if (name === "draft_client_report") {
    const report = draftReport(args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(report, null, 2),
        },
      ],
    };
  }
  if (name === "render_client_report_pdf") {
    if (!args.report) throw new Error("report is required");
    const pdf = renderPdf(args.report);
    const filename = `${slug(args.report.client)}-weekly-report.pdf`;
    if (publishPdf) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ filename, mimeType: "application/pdf", ...publishPdf(pdf, filename) }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            filename,
            mimeType: "application/pdf",
            pdf_base64: pdf.toString("base64"),
          }),
        },
      ],
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

function readResource({ uri }) {
  if (uri !== "ui://client-report/review") throw new Error(`Unknown resource: ${uri}`);
  const html = readFileSync(new URL("../ui/review.html", import.meta.url), "utf8");
  return { contents: [{ uri, mimeType: "text/html", text: html }] };
}

function slug(value) {
  return String(value || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function start() {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    buffer = drain(buffer);
  });
}

function drain(buffer) {
  while (buffer.length > 0) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      if (buffer[0] === 0x7b) return drainJson(buffer);
      return buffer;
    }
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) return Buffer.alloc(0);
    const length = Number(match[1]);
    const startAt = headerEnd + 4;
    if (buffer.length < startAt + length) return buffer;
    dispatch(buffer.slice(startAt, startAt + length).toString("utf8"));
    buffer = buffer.slice(startAt + length);
  }
  return buffer;
}

function drainJson(buffer) {
  const text = buffer.toString("utf8");
  const newline = text.indexOf("\n");
  if (newline === -1) return buffer;
  dispatch(text.slice(0, newline));
  return drain(Buffer.from(text.slice(newline + 1)));
}

function dispatch(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  const response = handleMessage(message);
  if (response) writeMessage(response);
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json);
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

if (import.meta.url === `file://${process.argv[1]}`) start();
