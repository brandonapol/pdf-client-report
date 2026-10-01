import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const example = fileURLToPath(new URL("../examples/acme-weekly.csv", import.meta.url));

test("writes the client pdf into the working directory", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pdf-client-report-"));
  const run = spawnSync(process.execPath, [cli, example, "Acme Co", "Week of Sep 28"], { cwd, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.file, "acme-co-weekly-report.pdf");
  assert.equal(readFileSync(join(cwd, output.file)).subarray(0, 5).toString(), "%PDF-");
});

test("prints usage and exits non-zero without a csv", () => {
  const run = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Usage/);
});
