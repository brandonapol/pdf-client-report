#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { handleMessage } from "./server.js";
import { isEntryPoint } from "./entry.js";

const MAX_BODY = 5 * 1024 * 1024;
const PDF_TTL_MS = 15 * 60 * 1000;
const TOOL_CALLS_PER_MINUTE = 30;
const MAX_STORED_PDFS = 500;
const MAX_CLIENT_NAME = 64;
const MAX_CLIENT_NAMES = 50;
const SITE = readFileSync(new URL("../ui/site.html", import.meta.url), "utf8");

export function createApp(options = {}) {
  const state = {
    pdfs: new Map(),
    maxStoredPdfs: options.maxStoredPdfs ?? MAX_STORED_PDFS,
    limiter: createLimiter(options.toolCallsPerMinute ?? TOOL_CALLS_PER_MINUTE),
    stats: { since: new Date().toISOString(), days: {}, clients: {} },
  };
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/") return send(res, 200, "text/html; charset=utf-8", SITE);
      if (url.pathname === "/healthz") return send(res, 200, "text/plain", "ok\n");
      if (url.pathname === "/.well-known/openai-apps-challenge") {
        // OpenAI's domain verification for directory submission; the token comes from the dashboard.
        const token = process.env.OPENAI_APPS_CHALLENGE;
        return token ? send(res, 200, "text/plain", token) : send(res, 404, "text/plain", "Not found\n");
      }
      if (url.pathname === "/mcp") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          return send(res, 405, "text/plain", "Use POST for MCP requests.\n");
        }
        return await handleMcp(req, res, state);
      }
      if (url.pathname === "/stats") return serveStats(req, res, state.stats);
      const file = url.pathname.match(/^\/files\/([0-9a-f-]{36})\/[^/]+\.pdf$/);
      if (file && req.method === "GET") return servePdf(res, state.pdfs, file[1]);
      return send(res, 404, "text/plain", "Not found\n");
    } catch (err) {
      return send(res, 500, "text/plain", `${err.message}\n`);
    }
  });
}

async function handleMcp(req, res, state) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: err.message } });
  }
  const options = { publishPdf: (pdf, filename) => publishPdf(req, state, pdf, filename) };
  const client = clientKey(req);
  const responses = (Array.isArray(payload) ? payload : [payload])
    .map((message) => handleCounted(message, options, client, state))
    .filter(Boolean);
  if (responses.length === 0) {
    res.writeHead(202);
    return res.end();
  }
  return sendJson(res, 200, Array.isArray(payload) ? responses : responses[0]);
}

// Only tool calls do real work, so only they spend the client's budget; initialize and list stay free.
function handleCounted(message, options, client, state) {
  if (message?.method === "initialize") countClient(state.stats, message.params?.clientInfo?.name);
  if (message?.method !== "tools/call" || message.id == null) return handleMessage(message, options);
  const day = state.stats.days[today()] ??= { draft_client_report: 0, render_client_report_pdf: 0, tool_errors: 0, rate_limited: 0 };
  const wait = state.limiter.take(client);
  if (wait > 0) {
    day.rate_limited += 1;
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: { isError: true, content: [{ type: "text", text: `Too many reports from this connection; try again in ${wait} seconds.` }] },
    };
  }
  const response = handleMessage(message, options);
  if (response?.result?.isError) day.tool_errors += 1;
  else if (message.params?.name in day) day[message.params.name] += 1;
  return response;
}

// Stateless HTTP means only initialize announces who is calling, so count the name there.
// Names are caller-supplied: trim, cap the length, and fold extras into "other" so the table stays bounded.
function countClient(stats, name) {
  const table = stats.clients[today()] ??= {};
  let key = typeof name === "string" && name.trim() ? name.trim().slice(0, MAX_CLIENT_NAME) : "unknown";
  if (!(key in table) && Object.keys(table).length >= MAX_CLIENT_NAMES) key = "other";
  table[key] = (table[key] ?? 0) + 1;
}

// Token bucket per client: a full minute's budget up front, refilled continuously.
function createLimiter(perMinute) {
  const buckets = new Map();
  return {
    take(key) {
      const now = Date.now();
      if (buckets.size > 10000) buckets.clear();
      const bucket = buckets.get(key) ?? { tokens: perMinute, at: now };
      bucket.tokens = Math.min(perMinute, bucket.tokens + ((now - bucket.at) / 60000) * perMinute);
      bucket.at = now;
      buckets.set(key, bucket);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return 0;
      }
      return Math.ceil(((1 - bucket.tokens) * 60) / perMinute);
    },
  };
}

// DigitalOcean's load balancer sets do-connecting-ip to the real client; behind it every socket is the balancer.
function clientKey(req) {
  return req.headers["do-connecting-ip"] || req.socket.remoteAddress;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Counts only, never report contents. 404 when unconfigured so the endpoint is invisible by default.
function serveStats(req, res, stats) {
  const token = process.env.STATS_TOKEN;
  if (!token) return send(res, 404, "text/plain", "Not found\n");
  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(req.headers.authorization || "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return send(res, 401, "text/plain", "Unauthorized\n");
  }
  return sendJson(res, 200, stats);
}

function publishPdf(req, state, pdf, filename) {
  const { pdfs } = state;
  sweep(pdfs);
  // Maps iterate in insertion order, so the first key is the oldest link.
  while (pdfs.size >= state.maxStoredPdfs) pdfs.delete(pdfs.keys().next().value);
  const id = randomUUID();
  pdfs.set(id, { pdf, filename, expires: Date.now() + PDF_TTL_MS });
  const base = process.env.PUBLIC_URL || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
  return {
    download_url: `${base.replace(/\/$/, "")}/files/${id}/${encodeURIComponent(filename)}`,
    expires_in_minutes: PDF_TTL_MS / 60000,
  };
}

function servePdf(res, pdfs, id) {
  sweep(pdfs);
  const entry = pdfs.get(id);
  if (!entry) return send(res, 404, "text/plain", "This report link has expired.\n");
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${entry.filename}"`,
    "Cache-Control": "no-store",
  });
  return res.end(entry.pdf);
}

function sweep(pdfs) {
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

if (isEntryPoint(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`pdf-client-report MCP listening on :${port}/mcp`);
  });
}
