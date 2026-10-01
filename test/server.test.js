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

const call = (name, args, id = 10) =>
  handleMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

test("negotiates a supported protocol version and falls back to the newest", () => {
  const supported = handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assert.equal(supported.result.protocolVersion, "2025-03-26");
  const unknown = handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(unknown.result.protocolVersion, "2025-06-18");
  assert.deepEqual(Object.keys(unknown.result.capabilities).sort(), ["resources", "tools"]);
});

test("answers ping", () => {
  assert.deepEqual(handleMessage({ jsonrpc: "2.0", id: 7, method: "ping" }), { jsonrpc: "2.0", id: 7, result: {} });
});

test("every tool has an object schema, required fields it defines, and annotations", () => {
  const { tools } = handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }).result;
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object", tool.name);
    for (const field of tool.inputSchema.required) assert.ok(tool.inputSchema.properties[field], `${tool.name}.${field}`);
    assert.ok(tool.description.length > 20, tool.name);
    assert.equal(tool.annotations.destructiveHint, false, tool.name);
  }
});

test("returns tool input errors as isError results the model can read", () => {
  const empty = call("draft_client_report", { client: "Acme", csv: "metric,value\n" });
  assert.equal(empty.result.isError, true);
  assert.match(empty.result.content[0].text, /No metrics found/);

  const missing = call("render_client_report_pdf", {});
  assert.equal(missing.result.isError, true);
  assert.match(missing.result.content[0].text, /report is required/);

  const malformed = call("render_client_report_pdf", { report: { client: "A", moved: "x" } });
  assert.equal(malformed.result.isError, true);
  assert.match(malformed.result.content[0].text, /report\.moved must be an array/);
});

test("rejects unknown tools with invalid params", () => {
  const response = call("delete_everything", {});
  assert.equal(response.error.code, -32602);
});

test("uses a safe fallback filename", () => {
  const response = call("render_client_report_pdf", { report: { client: "!!!" } });
  assert.equal(JSON.parse(response.result.content[0].text).filename, "client-weekly-report.pdf");
});

test("returns method not found for unknown methods", () => {
  const response = handleMessage({ jsonrpc: "2.0", id: 9, method: "prompts/list" });
  assert.equal(response.error.code, -32601);
});

test("lists and reads the review resource and rejects other uris", () => {
  const listed = handleMessage({ jsonrpc: "2.0", id: 1, method: "resources/list" }).result.resources;
  assert.deepEqual(
    listed.map((resource) => resource.uri),
    ["ui://client-report/review"],
  );
  const read = handleMessage({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: listed[0].uri } });
  assert.match(read.result.contents[0].text, /<html/);
  const bad = handleMessage({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "file:///etc/passwd" } });
  assert.match(bad.error.message, /Unknown resource/);
});

test("ignores non-jsonrpc input and notifications without an id", () => {
  assert.equal(handleMessage(null), null);
  assert.equal(handleMessage({ id: 1, method: "ping" }), null);
  assert.equal(handleMessage({ jsonrpc: "2.0", method: "notifications/cancelled" }), null);
  assert.equal(handleMessage({ jsonrpc: "2.0", method: "tools/list" }), null);
});
