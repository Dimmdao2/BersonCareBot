#!/usr/bin/env node
/**
 * Security audit against registry.npmjs.org using the bulk advisories API
 * (`/-/npm/v1/security/advisories/bulk`). Aligns with `pnpm audit` defaults:
 * all installed dependencies (including dev), transitive tree (`--depth 999`),
 * and `--audit-level` (default `low`, same as pnpm).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BULK_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const BATCH = 180;

/** @type {Record<string, number>} */
const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const ALLOWED_LEVELS = new Set(["low", "moderate", "high", "critical"]);

function parseArgs(argv) {
  let prodOnly = false;
  /** @type {"low"|"moderate"|"high"|"critical"} */
  let auditLevel = "low";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prod" || a === "-P") {
      prodOnly = true;
      continue;
    }
    if (a.startsWith("--audit-level=")) {
      const v = a.slice("--audit-level=".length).toLowerCase();
      if (!ALLOWED_LEVELS.has(v)) {
        throw new Error(`registry-prod-audit: invalid --audit-level=${v} (use low|moderate|high|critical)`);
      }
      auditLevel = /** @type {"low"|"moderate"|"high"|"critical"} */ (v);
      continue;
    }
    if (a === "--audit-level" && argv[i + 1]) {
      const v = argv[++i].toLowerCase();
      if (!ALLOWED_LEVELS.has(v)) {
        throw new Error(`registry-prod-audit: invalid --audit-level ${v} (use low|moderate|high|critical)`);
      }
      auditLevel = /** @type {"low"|"moderate"|"high"|"critical"} */ (v);
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/registry-prod-audit.mjs [options]

Options:
  --audit-level <low|moderate|high|critical>   Minimum severity (default: low, same as pnpm audit)
  --prod, -P                                   Only production dependencies (pnpm list --prod)
`);
      process.exit(0);
    }
    throw new Error(`registry-prod-audit: unknown argument: ${a}`);
  }
  return { prodOnly, auditLevel };
}

function severityMeetsThreshold(severityRaw, minLevel) {
  const key = typeof severityRaw === "string" ? severityRaw.trim().toLowerCase() : "";
  const advRank = SEVERITY_RANK[key] ?? SEVERITY_RANK.low;
  const minRank = SEVERITY_RANK[minLevel];
  return advRank >= minRank;
}

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

/**
 * @param {any} p
 * @param {Map<string, Set<string>>} acc
 * @param {{ prodOnly: boolean }} opts
 */
function visitProjectDependencyFields(p, acc, opts) {
  visitDeps(p.dependencies, acc);
  visitDeps(p.optionalDependencies, acc);
  if (!opts.prodOnly) {
    visitDeps(p.devDependencies, acc);
  }
}

function collectInstalledPackages(prodOnly) {
  const args = ["list", "-r", "--depth", "999", "--json"];
  if (prodOnly) {
    args.splice(2, 0, "--prod");
  }
  const raw = execFileSync("pnpm", args, {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024,
    encoding: "utf8",
  });
  const projects = JSON.parse(raw);
  const acc = new Map();
  const opts = { prodOnly };
  for (const p of projects) {
    visitProjectDependencyFields(p, acc, opts);
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
  const { prodOnly, auditLevel } = parseArgs(process.argv);
  const semver = loadSemver();
  const packages = collectInstalledPackages(prodOnly);
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
          if (!severityMeetsThreshold(adv.severity, auditLevel)) continue;
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

  const scope = prodOnly ? "production" : "all";
  if (hits.length === 0) {
    console.log(
      `registry-prod-audit: no known vulnerabilities (${scope} deps, audit-level >= ${auditLevel})`,
    );
    return;
  }

  console.error(
    `registry-prod-audit: found vulnerable dependencies (${scope} deps, audit-level >= ${auditLevel}):\n`,
  );
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
