#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isEntryPoint } from "./entry.js";
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
    if (message.method === "tools/call") {
      const name = message.params?.name;
      if (!tools.some((tool) => tool.name === name)) {
        return error(message.id, -32602, `Unknown tool: ${name}`);
      }
      return result(message.id, callToolSafely(message.params, options));
    }
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

// Bad input comes back as an isError result, not a protocol error, so the model can read it and retry.
function callToolSafely(params, options) {
  try {
    return callTool(params, options);
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: err.message }] };
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
    if (!args.report || typeof args.report !== "object") throw new Error("report is required");
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
    .replace(/^-|-$/g, "") || "client";
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// MCP stdio transport: one JSON-RPC message per line. Nothing else may go to stdout.
function start() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) dispatch(line);
      newline = buffer.indexOf("\n");
    }
  });
}

function dispatch(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    writeMessage(error(null, -32700, "Parse error"));
    return;
  }
  const response = handleMessage(message);
  if (response) writeMessage(response);
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

if (isEntryPoint(import.meta.url)) start();
