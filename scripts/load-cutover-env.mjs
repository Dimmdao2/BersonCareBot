import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export const DEFAULT_CUTOVER_ENV_FILES = [
  "/opt/env/bersoncarebot/cutover.prod",
  path.join(repoRoot, ".env.cutover.dev"),
  path.join(repoRoot, ".env.cutover"),
];

function parseEnvFile(content) {
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eqIdx = normalized.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = normalized.slice(0, eqIdx).trim();
    let value = normalized.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadCutoverEnv(options = {}) {
  const override = options.override === true;
  const explicitPath = options.path || process.env.CUTOVER_ENV_FILE;
  const candidates = explicitPath ? [explicitPath] : DEFAULT_CUTOVER_ENV_FILES;
  const resolvedPath = candidates.find((candidate) => candidate && existsSync(candidate)) ?? candidates[0] ?? null;
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { loaded: false, path: resolvedPath };
  }

  const parsed = parseEnvFile(readFileSync(resolvedPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  return { loaded: true, path: resolvedPath };
}
