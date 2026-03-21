import { existsSync, readFileSync } from "node:fs";

export const DEFAULT_CUTOVER_ENV_FILE = "/opt/env/bersoncarebot/cutover.prod";

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
  const path = options.path || process.env.CUTOVER_ENV_FILE || DEFAULT_CUTOVER_ENV_FILE;
  const override = options.override === true;
  if (!path || !existsSync(path)) {
    return { loaded: false, path };
  }

  const parsed = parseEnvFile(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  return { loaded: true, path };
}
