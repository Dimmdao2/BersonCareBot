#!/usr/bin/env node
/**
 * Production dependency audit against registry.npmjs.org using the bulk
 * advisories API. `pnpm audit` still calls retired npm endpoints (410).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BULK_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const BATCH = 180;

function loadSemver() {
  const pnpmDir = path.join(root, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmDir)) {
    throw new Error("node_modules/.pnpm missing; run pnpm install first");
  }
  const candidates = fs
    .readdirSync(pnpmDir)
    .filter((n) => n.startsWith("semver@"))
    .map((n) => path.join(pnpmDir, n, "node_modules", "semver"))
    .filter((p) => fs.existsSync(path.join(p, "package.json")));
  if (candidates.length === 0) {
    throw new Error("semver not found under node_modules/.pnpm");
  }
  candidates.sort();
  const pick = candidates[candidates.length - 1];
  const require = createRequire(import.meta.url);
  return require(pick);
}

function shouldRecord(meta) {
  if (!meta || typeof meta !== "object") return false;
  const v = meta.version;
  if (typeof v !== "string") return false;
  if (v.startsWith("link:") || v.startsWith("workspace:") || v.startsWith("file:")) return false;
  const r = meta.resolved;
  if (typeof r === "string" && r.includes("registry.npmjs.org")) return true;
  // Some hoisted entries omit `resolved` but still carry a semver version.
  return /^[\d.]+(?:-[\w.-]+)?$/.test(v) || /^\d+\.\d+\.\d+/.test(v);
}

function visitDeps(deps, acc) {
  if (!deps || typeof deps !== "object") return;
  for (const [name, meta] of Object.entries(deps)) {
    if (shouldRecord(meta)) {
      let s = acc.get(name);
      if (!s) {
        s = new Set();
        acc.set(name, s);
      }
      s.add(meta.version);
    }
    visitDeps(meta.dependencies, acc);
    visitDeps(meta.optionalDependencies, acc);
  }
}

function collectProdPackages() {
  const raw = execFileSync("pnpm", ["list", "-r", "--prod", "--depth", "999", "--json"], {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024,
    encoding: "utf8",
  });
  const projects = JSON.parse(raw);
  const acc = new Map();
  for (const p of projects) {
    visitDeps(p.dependencies, acc);
    visitDeps(p.optionalDependencies, acc);
  }
  return acc;
}

function chunkEntries(map) {
  const entries = [...map.entries()].filter(([, vers]) => vers.size > 0);
  const out = [];
  for (let i = 0; i < entries.length; i += BATCH) {
    out.push(entries.slice(i, i + BATCH));
  }
  return out;
}

async function postBatch(body) {
  const res = await fetch(BULK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`bulk advisories HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function main() {
  const semver = loadSemver();
  const packages = collectProdPackages();
  const batches = chunkEntries(packages);
  if (batches.length === 0) {
    console.log("registry-prod-audit: no registry dependencies found");
    return;
  }

  /** @type {Array<{ pkg: string, version: string, advisory: any }>} */
  const hits = [];

  for (const batch of batches) {
    const payload = Object.fromEntries(batch.map(([name, vers]) => [name, [...vers]]));
    const report = await postBatch(payload);
    for (const [pkg, advisories] of Object.entries(report)) {
      if (!Array.isArray(advisories) || advisories.length === 0) continue;
      const versions = packages.get(pkg);
      if (!versions) continue;
      for (const version of versions) {
        const coerced = semver.coerce(version)?.version ?? version;
        for (const adv of advisories) {
          const range = adv.vulnerable_versions;
          if (typeof range !== "string" || !range.trim()) continue;
          try {
            if (semver.satisfies(coerced, range, { includePrerelease: true })) {
              hits.push({ pkg, version, advisory: adv });
            }
          } catch {
            // ignore malformed ranges from registry
          }
        }
      }
    }
  }

  if (hits.length === 0) {
    console.log("registry-prod-audit: no known vulnerabilities in production registry dependencies");
    return;
  }

  console.error("registry-prod-audit: found vulnerable production dependencies:\n");
  for (const h of hits) {
    const a = h.advisory;
    console.error(
      `  - ${h.pkg}@${h.version}: [${a.severity}] ${a.title} (${a.vulnerable_versions})`,
    );
    if (typeof a.url === "string" && a.url) console.error(`    ${a.url}`);
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
