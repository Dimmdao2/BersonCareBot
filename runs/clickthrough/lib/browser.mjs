/**
 * Resolves Playwright from the box's global npm install (not a repo dependency — see
 * runs/clickthrough/README.md for why). Falls back to a local node_modules resolution if the repo
 * ever gains its own playwright dependency later.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

function resolvePlaywright() {
  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    const req = createRequire(globalRoot + "/");
    return req("playwright");
  } catch (e) {
    // Fall back to normal resolution (e.g. if a future run adds playwright as a devDependency).
    const req = createRequire(import.meta.url);
    return req("playwright");
  }
}

export const { chromium } = resolvePlaywright();

export const BASE_URL = process.env.CLICKTHROUGH_BASE_URL || "http://127.0.0.1:6300";
