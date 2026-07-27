import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyAdvisoryHits, loadAdvisoryAllowlist } from "./registry-prod-audit.mjs";

const exception = {
  id: "GHSA-mh99-v99m-4gvg",
  package: "brace-expansion",
  reason: "lint-time only",
  reviewBy: "2026-10-27",
};

test("an expired exception fails closed and demands review", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "registry-prod-audit-test-"));
  const fixture = path.join(directory, "allowlist.json");
  try {
    fs.writeFileSync(fixture, `${JSON.stringify({ advisories: [{ ...exception, reviewBy: "2026-01-01" }] })}\n`);
    assert.throws(
      () => loadAdvisoryAllowlist({ filePath: fixture, today: "2026-07-27" }),
      /exception expired.*must be re-justified or removed/u,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("an unrelated advisory remains a gate failure", () => {
  const unrelatedHit = {
    pkg: "brace-expansion",
    version: "1.1.16",
    advisory: { url: "https://github.com/advisories/GHSA-unrelated-example" },
  };
  const result = classifyAdvisoryHits([unrelatedHit], [exception]);
  assert.deepEqual(result.suppressed, []);
  assert.deepEqual(result.failures, [unrelatedHit]);
});
