import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createApp } from "../src/http.js";

async function withServer(fn) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function rpc(base, body) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
}

test("negotiates initialize over http", () =>
  withServer(async (base) => {
    const res = await rpc(base, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).result.protocolVersion, "2025-06-18");
  }));

test("accepts notifications with 202", () =>
  withServer(async (base) => {
    const res = await rpc(base, { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(res.status, 202);
  }));

test("renders a pdf as a download link", () =>
  withServer(async (base) => {
    const csv = readFileSync(new URL("../examples/acme-weekly.csv", import.meta.url), "utf8");
    const drafted = await (
      await rpc(base, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "draft_client_report", arguments: { client: "Acme", csv } },
      })
    ).json();
    const report = JSON.parse(drafted.result.content[0].text);
    const rendered = await (
      await rpc(base, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "render_client_report_pdf", arguments: { report } },
      })
    ).json();
    const payload = JSON.parse(rendered.result.content[0].text);
    assert.equal(payload.filename, "acme-weekly-report.pdf");
    assert.equal(payload.pdf_base64, undefined);
    const pdf = await fetch(payload.download_url);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  }));

test("reads the review resource", () =>
  withServer(async (base) => {
    const res = await rpc(base, {
      jsonrpc: "2.0",
      id: 4,
      method: "resources/read",
      params: { uri: "ui://client-report/review" },
    });
    assert.match((await res.json()).result.contents[0].text, /Friday client report/);
  }));

test("serves health checks and rejects other paths and methods", () =>
  withServer(async (base) => {
    assert.equal(await (await fetch(`${base}/healthz`)).text(), "ok\n");
    const get = await fetch(`${base}/mcp`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  }));

test("returns a parse error for invalid json", () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/mcp`, { method: "POST", body: "{nope" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, -32700);
  }));

test("answers json-rpc batches in order", () =>
  withServer(async (base) => {
    const res = await rpc(base, [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    const body = await res.json();
    assert.deepEqual(
      body.map((item) => item.id),
      [1, 2],
    );
  }));

test("rejects bodies over 5 MB", () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/mcp`, { method: "POST", body: "x".repeat(5 * 1024 * 1024 + 1) }).catch((err) => err);
    if (res instanceof Error) return; // the server may drop the socket before the client finishes sending
    assert.equal(res.status, 400);
  }));

test("names the download and expires unknown links", () =>
  withServer(async (base) => {
    const rendered = await (
      await rpc(base, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "render_client_report_pdf", arguments: { report: { client: "Acme" } } },
      })
    ).json();
    const { download_url } = JSON.parse(rendered.result.content[0].text);
    const pdf = await fetch(download_url);
    assert.equal(pdf.headers.get("content-disposition"), 'attachment; filename="acme-weekly-report.pdf"');
    assert.equal(pdf.headers.get("cache-control"), "no-store");
    const missing = await fetch(`${base}/files/00000000-0000-0000-0000-000000000000/x.pdf`);
    assert.equal(missing.status, 404);
  }));

test("uses PUBLIC_URL for download links when set", () =>
  withServer(async (base) => {
    process.env.PUBLIC_URL = "https://reports.example.com/";
    try {
      const rendered = await (
        await rpc(base, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "render_client_report_pdf", arguments: { report: { client: "Acme" } } },
        })
      ).json();
      assert.match(JSON.parse(rendered.result.content[0].text).download_url, /^https:\/\/reports\.example\.com\/files\/[0-9a-f-]{36}\/acme-weekly-report\.pdf$/);
    } finally {
      delete process.env.PUBLIC_URL;
    }
  }));

test("serves the website at the root", () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^text\/html/);
    const html = await res.text();
    assert.match(html, /<title>Client Weekly Report<\/title>/);
    assert.match(html, /https:\/\/pdf-client-report-6it6p\.ondigitalocean\.app\/mcp/);
  }));

test("answers the openai domain challenge only when configured", () =>
  withServer(async (base) => {
    const path = `${base}/.well-known/openai-apps-challenge`;
    assert.equal((await fetch(path)).status, 404);
    process.env.OPENAI_APPS_CHALLENGE = "token-123";
    try {
      const res = await fetch(path);
      assert.equal(res.headers.get("content-type"), "text/plain");
      assert.equal(await res.text(), "token-123");
    } finally {
      delete process.env.OPENAI_APPS_CHALLENGE;
    }
  }));

async function withApp(options, fn) {
  const server = createApp(options).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function callTool(base, id) {
  return rpc(base, {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: "draft_client_report", arguments: { client: "Acme", csv: "metric,value\nVisits,10" } },
  }).then((res) => res.json());
}

test("rate limits tool calls per client as a readable tool error", () =>
  withApp({ toolCallsPerMinute: 2 }, async (base) => {
    assert.equal((await callTool(base, 1)).result.isError, undefined);
    assert.equal((await callTool(base, 2)).result.isError, undefined);
    const limited = await callTool(base, 3);
    assert.equal(limited.id, 3);
    assert.equal(limited.result.isError, true);
    assert.match(limited.result.content[0].text, /Too many reports.*try again in \d+ seconds/);
    const ping = await (await rpc(base, { jsonrpc: "2.0", id: 4, method: "ping" })).json();
    assert.deepEqual(ping.result, {});
  }));

test("keys the rate limit on the platform's connecting ip header", () =>
  withApp({ toolCallsPerMinute: 1 }, async (base) => {
    const call = (ip) =>
      fetch(`${base}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "do-connecting-ip": ip },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "draft_client_report", arguments: { client: "A", csv: "metric,value\nV,1" } } }),
      }).then((res) => res.json());
    assert.equal((await call("1.1.1.1")).result.isError, undefined);
    assert.equal((await call("2.2.2.2")).result.isError, undefined);
    assert.equal((await call("1.1.1.1")).result.isError, true);
  }));

test("keeps only the newest stored pdfs", () =>
  withApp({ maxStoredPdfs: 1 }, async (base) => {
    const render = async (id) =>
      JSON.parse(
        (
          await (
            await rpc(base, { jsonrpc: "2.0", id, method: "tools/call", params: { name: "render_client_report_pdf", arguments: { report: { client: "Acme" } } } })
          ).json()
        ).result.content[0].text,
      ).download_url;
    const first = await render(1);
    const second = await render(2);
    assert.equal((await fetch(first)).status, 404);
    assert.equal((await fetch(second)).status, 200);
  }));

test("hides usage stats unless a token is configured and sent", () =>
  withApp({}, async (base) => {
    assert.equal((await fetch(`${base}/stats`)).status, 404);
    process.env.STATS_TOKEN = "secret";
    try {
      assert.equal((await fetch(`${base}/stats`)).status, 401);
      assert.equal((await fetch(`${base}/stats`, { headers: { Authorization: "Bearer nope" } })).status, 401);
    } finally {
      delete process.env.STATS_TOKEN;
    }
  }));

test("counts tool calls by day without keeping report contents", () =>
  withApp({ toolCallsPerMinute: 3 }, async (base) => {
    await callTool(base, 1);
    await rpc(base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "draft_client_report", arguments: {} } });
    await rpc(base, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "render_client_report_pdf", arguments: { report: { client: "Acme" } } } });
    await callTool(base, 4);
    process.env.STATS_TOKEN = "secret";
    try {
      const res = await fetch(`${base}/stats`, { headers: { Authorization: "Bearer secret" } });
      assert.equal(res.status, 200);
      const stats = await res.json();
      const today = new Date().toISOString().slice(0, 10);
      assert.deepEqual(stats.days[today], { draft_client_report: 1, render_client_report_pdf: 1, tool_errors: 1, rate_limited: 1 });
      assert.match(stats.since, /^\d{4}-\d{2}-\d{2}T/);
      assert.doesNotMatch(JSON.stringify(stats), /Acme|Visits/);
    } finally {
      delete process.env.STATS_TOKEN;
    }
  }));
