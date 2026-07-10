#!/usr/bin/env node
/**
 * Download the Zenodo Russian names dataset for local FIO backfill tooling.
 *
 * The dataset is intentionally stored under `.tmp/` and must not be committed.
 * Source: https://zenodo.org/records/2747011
 * DOI: 10.5281/zenodo.2747011
 * Author: Ivan Begtin / Infoculture
 * License metadata on Zenodo: Creative Commons Attribution 4.0 International
 *
 * Usage:
 *   node scripts/fio-backfill/download-russiannames-dataset.mjs
 *   node scripts/fio-backfill/download-russiannames-dataset.mjs --force
 */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const DATASET = {
  url: "https://zenodo.org/records/2747011/files/russiannames_db_jsonl.zip?download=1",
  filename: "russiannames_db_jsonl.zip",
  md5: "10b4bf03e1eea33f72d4284fd2a582b9",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const targetDir = resolve(repoRoot, ".tmp/fio-backfill/russiannames");
const zipPath = resolve(targetDir, DATASET.filename);
const extractDir = resolve(targetDir, "jsonl");
const force = process.argv.includes("--force");

function md5File(path) {
  const hash = createHash("md5");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function listExtractedFiles() {
  if (!existsSync(extractDir)) return [];
  return readdirSync(extractDir)
    .map((name) => resolve(extractDir, name))
    .filter((path) => statSync(path).isFile());
}

async function download() {
  mkdirSync(targetDir, { recursive: true });
  if (existsSync(zipPath) && !force) {
    console.log(`[fio-backfill] ZIP exists: ${zipPath}`);
    return;
  }
  if (force && existsSync(zipPath)) {
    await rm(zipPath);
  }
  console.log(`[fio-backfill] Downloading ${DATASET.url}`);
  const response = await fetch(DATASET.url, {
    headers: {
      "user-agent": "BersonCareBot-fio-backfill/1.0 (local development script)",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`download_failed:${response.status}:${response.statusText}`);
  }
  await pipeline(response.body, createWriteStream(zipPath));
  console.log(`[fio-backfill] Saved ${zipPath}`);
}

async function extract() {
  const actualMd5 = md5File(zipPath);
  if (actualMd5 !== DATASET.md5) {
    throw new Error(`checksum_mismatch: expected ${DATASET.md5}, got ${actualMd5}`);
  }
  console.log(`[fio-backfill] MD5 ok: ${actualMd5}`);

  if (force && existsSync(extractDir)) {
    await rm(extractDir, { recursive: true, force: true });
  }
  mkdirSync(extractDir, { recursive: true });

  const existing = listExtractedFiles();
  if (existing.length > 0 && !force) {
    console.log(`[fio-backfill] Already extracted: ${extractDir}`);
    for (const file of existing) console.log(`  - ${file}`);
    return;
  }

  const unzip = spawnSync("unzip", ["-o", zipPath, "-d", extractDir], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (unzip.status !== 0) {
    const py = spawnSync("python3", ["-m", "zipfile", "-e", zipPath, extractDir], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (py.status !== 0) {
      const unzipMessage = unzip.stderr || unzip.stdout || `status=${String(unzip.status)}`;
      const pyMessage = py.stderr || py.stdout || `status=${String(py.status)}`;
      throw new Error(`extract_failed: unzip(${unzipMessage}); python3_zipfile(${pyMessage})`);
    }
  }

  console.log(`[fio-backfill] Extracted to ${extractDir}`);
  for (const file of listExtractedFiles()) console.log(`  - ${file}`);
}

async function main() {
  await download();
  await extract();
  console.log("[fio-backfill] Dataset is local-only and ignored by git under .tmp/.");
}

main().catch((err) => {
  console.error(`[fio-backfill] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
