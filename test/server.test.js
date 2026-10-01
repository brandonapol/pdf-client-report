import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { handleMessage } from "../src/server.js";

test("lists the draft and render tools", () => {
  const response = handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.deepEqual(
    response.result.tools.map((tool) => tool.name),
    ["draft_client_report", "render_client_report_pdf"],
  );
});

test("drafts and renders through the mcp tools", () => {
  const csv = readFileSync(new URL("../examples/acme-weekly.csv", import.meta.url), "utf8");
  const drafted = handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "draft_client_report", arguments: { client: "Acme", csv } },
  });
  const report = JSON.parse(drafted.result.content[0].text);
  assert.equal(report.client, "Acme");

  const rendered = handleMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "render_client_report_pdf", arguments: { report } },
  });
  const payload = JSON.parse(rendered.result.content[0].text);
  assert.equal(payload.filename, "acme-weekly-report.pdf");
  assert.equal(Buffer.from(payload.pdf_base64, "base64").subarray(0, 5).toString(), "%PDF-");
});

test("ignores the initialized notification", () => {
  const response = handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(response, null);
});
