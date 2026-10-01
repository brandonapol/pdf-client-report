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
