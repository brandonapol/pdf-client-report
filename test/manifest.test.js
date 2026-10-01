import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { handleMessage } from "../src/server.js";
import { draftReport } from "../src/report.js";
import { acmeCsv, readJson } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url);
const pkg = readJson("package.json");
const plugin = readJson("plugin.json");

test("the two plugin manifests are identical", () => {
  assert.deepEqual(readJson(".codex-plugin/plugin.json"), plugin);
});

test("package, plugin, and server versions match", () => {
  const init = handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(plugin.version, pkg.version);
  assert.equal(init.result.serverInfo.version, pkg.version);
  assert.equal(init.result.serverInfo.name, plugin.name);
  assert.equal(pkg.name, plugin.name);
});

test("the listing has the fields the directory shows", () => {
  const ui = plugin.extensions["com.openai"].interface;
  for (const key of ["displayName", "shortDescription", "longDescription", "developerName", "privacyPolicyURL", "termsOfServiceURL"]) {
    assert.ok(typeof ui[key] === "string" && ui[key].trim(), key);
  }
  assert.match(ui.brandColor, /^#[0-9A-F]{6}$/i);
  assert.ok(ui.shortDescription.length <= 60, "shortDescription should fit a card");
  assert.ok(ui.defaultPrompt.length >= 1);
});

test("policy links point at files that exist in this repo", () => {
  const ui = plugin.extensions["com.openai"].interface;
  for (const url of [ui.privacyPolicyURL, ui.termsOfServiceURL]) {
    const path = url.split("/blob/main/")[1];
    assert.ok(path && existsSync(new URL(path, root)), url);
  }
});

test("mcp.json launches a server file that exists", () => {
  const { mcpServers } = readJson("mcp.json");
  for (const server of Object.values(mcpServers)) {
    const script = server.args[0].replace("${PLUGIN_ROOT}/", "");
    assert.ok(existsSync(new URL(script, root)), script);
  }
  assert.ok(existsSync(new URL(pkg.bin[pkg.name], root)));
});

test("each skill has frontmatter whose name matches its folder", () => {
  for (const dir of readdirSync(new URL("skills/", root))) {
    const text = readFileSync(new URL(`skills/${dir}/SKILL.md`, root), "utf8");
    const front = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(front, `${dir} frontmatter`);
    assert.match(front[1], new RegExp(`^name: ${dir}$`, "m"));
    assert.match(front[1], /^description: .{40,}$/m);
  }
});

test("the skill names the tools the server exposes", () => {
  const skill = readFileSync(new URL("skills/client-weekly-report/SKILL.md", root), "utf8");
  const { tools } = handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }).result;
  for (const tool of tools) assert.ok(skill.includes(tool.name), tool.name);
});

test("the shipped example drafts a report", () => {
  assert.ok(draftReport({ client: "Acme", period: "W1", csv: acmeCsv }).metrics.length > 0);
});

test("the package has no runtime dependencies", () => {
  assert.equal(pkg.dependencies, undefined);
});
