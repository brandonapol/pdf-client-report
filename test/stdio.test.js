import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acmeCsv } from "./helpers/fixtures.js";

const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));

// Speaks MCP stdio the way Codex and ChatGPT developer mode do: one JSON message per line.
function startServer(path = serverPath) {
  const child = spawn(process.execPath, [path], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const waiting = [];
  // A fast reply can land before nextLine() runs. Leave it buffered and the reader waits for a chunk that never comes.
  const drain = () => {
    let newline;
    while ((newline = stdout.indexOf("\n")) !== -1 && waiting.length) {
      const line = stdout.slice(0, newline);
      stdout = stdout.slice(newline + 1);
      waiting.shift()(line);
    }
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    drain();
  });
  return {
    send(message) {
      child.stdin.write(typeof message === "string" ? message : `${JSON.stringify(message)}\n`);
    },
    nextLine() {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no response; stderr: ${stderr}`)), 5000);
        waiting.push((line) => {
          clearTimeout(timer);
          resolve(line);
        });
        drain();
      });
    },
    stop() {
      child.kill();
    },
  };
}

test("completes an mcp session over newline-delimited stdio", async (t) => {
  const server = startServer();
  t.after(() => server.stop());

  server.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } });
  const initLine = await server.nextLine();
  assert.doesNotMatch(initLine, /Content-Length/);
  assert.equal(JSON.parse(initLine).result.serverInfo.name, "pdf-client-report");

  server.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  server.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "draft_client_report", arguments: { client: "Acme", csv: acmeCsv } } });
  const draft = JSON.parse(await server.nextLine());
  assert.equal(draft.id, 2);
  const report = JSON.parse(draft.result.content[0].text);

  server.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "render_client_report_pdf", arguments: { report } } });
  const rendered = JSON.parse(JSON.parse(await server.nextLine()).result.content[0].text);
  assert.equal(Buffer.from(rendered.pdf_base64, "base64").subarray(0, 5).toString(), "%PDF-");
});

test("handles messages split across chunks and several in one chunk", async (t) => {
  const server = startServer();
  t.after(() => server.stop());
  const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
  server.send(ping.slice(0, 10));
  server.send(`${ping.slice(10)}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`);
  assert.equal(JSON.parse(await server.nextLine()).id, 1);
  assert.equal(JSON.parse(await server.nextLine()).id, 2);
});

test("delivers a stdio response that arrived before the reader waited", async (t) => {
  const server = startServer();
  t.after(() => server.stop());
  server.send({ jsonrpc: "2.0", id: 7, method: "ping" });
  // Ping returns immediately. Wait so the line is sitting in the buffer before anyone asks for it.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(JSON.parse(await server.nextLine()).id, 7);
});

test("answers malformed json with a parse error and keeps serving", async (t) => {
  const server = startServer();
  t.after(() => server.stop());
  server.send("{not json\n");
  assert.equal(JSON.parse(await server.nextLine()).error.code, -32700);
  server.send({ jsonrpc: "2.0", id: 5, method: "ping" });
  assert.equal(JSON.parse(await server.nextLine()).id, 5);
});

test("starts when launched through a symlink, as npm bin does", async (t) => {
  const link = join(mkdtempSync(join(tmpdir(), "pdf-client-report-")), "pdf-client-report");
  symlinkSync(serverPath, link);
  const server = startServer(link);
  t.after(() => server.stop());
  server.send({ jsonrpc: "2.0", id: 1, method: "ping" });
  assert.equal(JSON.parse(await server.nextLine()).id, 1);
});
