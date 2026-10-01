#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { handleMessage } from "./server.js";

const MAX_BODY = 5 * 1024 * 1024;
const PDF_TTL_MS = 15 * 60 * 1000;
const pdfs = new Map();

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/" || url.pathname === "/healthz") {
        return send(res, 200, "text/plain", "ok\n");
      }
      if (url.pathname === "/mcp") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          return send(res, 405, "text/plain", "Use POST for MCP requests.\n");
        }
        return await handleMcp(req, res);
      }
      const file = url.pathname.match(/^\/files\/([0-9a-f-]{36})\/[^/]+\.pdf$/);
      if (file && req.method === "GET") return servePdf(res, file[1]);
      return send(res, 404, "text/plain", "Not found\n");
    } catch (err) {
      return send(res, 500, "text/plain", `${err.message}\n`);
    }
  });
}

async function handleMcp(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: err.message } });
  }
  const options = { publishPdf: (pdf, filename) => publishPdf(req, pdf, filename) };
  const responses = (Array.isArray(payload) ? payload : [payload])
    .map((message) => handleMessage(message, options))
    .filter(Boolean);
  if (responses.length === 0) {
    res.writeHead(202);
    return res.end();
  }
  return sendJson(res, 200, Array.isArray(payload) ? responses : responses[0]);
}

function publishPdf(req, pdf, filename) {
  sweep();
  const id = randomUUID();
  pdfs.set(id, { pdf, expires: Date.now() + PDF_TTL_MS });
  const base = process.env.PUBLIC_URL || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
  return {
    download_url: `${base.replace(/\/$/, "")}/files/${id}/${encodeURIComponent(filename)}`,
    expires_in_minutes: PDF_TTL_MS / 60000,
  };
}

function servePdf(res, id) {
  sweep();
  const entry = pdfs.get(id);
  if (!entry) return send(res, 404, "text/plain", "This report link has expired.\n");
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": "attachment",
    "Cache-Control": "no-store",
  });
  return res.end(entry.pdf);
}

function sweep() {
  const now = Date.now();
  for (const [id, entry] of pdfs) if (entry.expires < now) pdfs.delete(id);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  return send(res, status, "application/json", JSON.stringify(value));
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type });
  return res.end(body);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`pdf-client-report MCP listening on :${port}/mcp`);
  });
}
