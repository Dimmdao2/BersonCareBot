#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const REQUIRED_PROCESS_NAMES = new Set(["webapp", "integrator", "media-worker"]);
const REQUIRED_SHARED_KEYS = ["DB_PRINCIPAL_CONTEXT_MODE", "DB_PRINCIPAL_SIGNING_SECRET"];
const WEBAPP_DUAL_URL_KEYS = ["DATABASE_URL_STAFF", "DATABASE_URL_NONSTAFF"];
const MIN_SECRET_BYTES = 32;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    envFiles: [],
    selfTest: false,
  };
  for (const arg of argv) {
    if (arg === "--self-test") {
      options.selfTest = true;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFiles.push(arg.slice("--env-file=".length));
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return options;
}

function parseEnvFileSpec(spec) {
  const separator = spec.indexOf(":");
  if (separator <= 0 || separator === spec.length - 1) {
    fail(`invalid --env-file spec, expected process:/path: ${spec}`);
  }
  const processName = spec.slice(0, separator);
  const path = spec.slice(separator + 1);
  if (!REQUIRED_PROCESS_NAMES.has(processName)) {
    fail(`unsupported process in --env-file: ${processName}`);
  }
  if (!path.startsWith("/")) {
    fail(`env file path must be absolute for ${processName}`);
  }
  return { processName, path };
}

function parseEnvText(text) {
  const values = new Map();
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    values.set(key, unquoteEnvValue(rawValue.trim()));
  }
  return values;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("\"") && value.endsWith("\""))
  ) {
    return value.slice(1, -1);
  }
  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

function loadEnvFile(spec) {
  const { processName, path } = parseEnvFileSpec(spec);
  const text = readFileSync(path, "utf8");
  return {
    basename: basename(path),
    path,
    processName,
    values: parseEnvText(text),
  };
}

function fingerprintSecret(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function fingerprintUrlHost(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}:${url.port || defaultPortForProtocol(url.protocol)}/${url.pathname.replace(/^\/+/, "")}`;
  } catch {
    return "<invalid-url>";
  }
}

function defaultPortForProtocol(protocol) {
  if (protocol === "postgresql:" || protocol === "postgres:") return "5432";
  return "";
}

function assertNoSecretLeak(output, loadedFiles) {
  for (const file of loadedFiles) {
    for (const key of ["DB_PRINCIPAL_SIGNING_SECRET", ...WEBAPP_DUAL_URL_KEYS]) {
      const value = file.values.get(key);
      if (value && output.includes(value)) {
        fail(`preflight output leaked ${key} from ${file.processName}`);
      }
    }
  }
}

function validateLoadedFiles(loadedFiles) {
  const seen = new Map();
  for (const file of loadedFiles) {
    if (seen.has(file.processName)) {
      fail(`duplicate env file for ${file.processName}`);
    }
    seen.set(file.processName, file);
  }

  for (const processName of REQUIRED_PROCESS_NAMES) {
    if (!seen.has(processName)) {
      fail(`missing --env-file for ${processName}`);
    }
  }

  const signingFingerprints = new Map();
  for (const file of loadedFiles) {
    for (const key of REQUIRED_SHARED_KEYS) {
      if (!file.values.has(key) || !file.values.get(key)?.trim()) {
        fail(`${file.processName} missing ${key}`);
      }
    }
    const mode = file.values.get("DB_PRINCIPAL_CONTEXT_MODE");
    if (mode !== "shadow" && mode !== "locked") {
      fail(`${file.processName} DB_PRINCIPAL_CONTEXT_MODE must be shadow or locked for C2 preflight`);
    }
    const secret = file.values.get("DB_PRINCIPAL_SIGNING_SECRET") ?? "";
    if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
      fail(`${file.processName} DB_PRINCIPAL_SIGNING_SECRET must be at least ${MIN_SECRET_BYTES} bytes`);
    }
    signingFingerprints.set(file.processName, fingerprintSecret(secret));
  }

  const uniqueSigningFingerprints = new Set(signingFingerprints.values());
  if (uniqueSigningFingerprints.size !== 1) {
    fail("DB_PRINCIPAL_SIGNING_SECRET fingerprint mismatch across signing processes");
  }

  const webapp = seen.get("webapp");
  for (const key of WEBAPP_DUAL_URL_KEYS) {
    const value = webapp?.values.get(key)?.trim() ?? "";
    if (!value) {
      fail(`webapp missing ${key}`);
    }
    if (value.includes("://") && !/^postgres(?:ql)?:\/\//.test(value)) {
      fail(`webapp ${key} must be a PostgreSQL URL`);
    }
  }
  if (webapp?.values.get("DATABASE_URL_STAFF") === webapp?.values.get("DATABASE_URL_NONSTAFF")) {
    fail("webapp DATABASE_URL_STAFF and DATABASE_URL_NONSTAFF must not be identical for C2 dual-login preflight");
  }

  return {
    signingFingerprint: [...uniqueSigningFingerprints][0],
    webappStaffUrlShape: fingerprintUrlHost(webapp?.values.get("DATABASE_URL_STAFF") ?? ""),
    webappNonstaffUrlShape: fingerprintUrlHost(webapp?.values.get("DATABASE_URL_NONSTAFF") ?? ""),
  };
}

function renderReport(loadedFiles, summary) {
  const lines = [
    "saas-c2-secret-preflight: OK",
    `signing_secret_sha256_16=${summary.signingFingerprint}`,
    `webapp_DATABASE_URL_STAFF_shape=${summary.webappStaffUrlShape}`,
    `webapp_DATABASE_URL_NONSTAFF_shape=${summary.webappNonstaffUrlShape}`,
    "restart_order=webapp integrator worker scheduler media-worker",
    "rollback_order=restore previous root-managed env files, restart same units, rerun this preflight",
  ];
  for (const file of loadedFiles) {
    lines.push(`process=${file.processName} env_file=${file.basename} mode=${file.values.get("DB_PRINCIPAL_CONTEXT_MODE")}`);
  }
  return `${lines.join("\n")}\n`;
}

function runPreflightFromSpecs(specs) {
  const loadedFiles = specs.map(loadEnvFile);
  const summary = validateLoadedFiles(loadedFiles);
  const output = renderReport(loadedFiles, summary);
  assertNoSecretLeak(output, loadedFiles);
  return output;
}

function runSelfTest() {
  const sharedSecret = randomBytes(40).toString("base64url");
  const fixtureFiles = [
    {
      basename: "webapp.fixture",
      path: "/tmp/webapp.fixture",
      processName: "webapp",
      values: parseEnvText(`
DB_PRINCIPAL_CONTEXT_MODE=shadow
DB_PRINCIPAL_SIGNING_SECRET='${sharedSecret}'
DATABASE_URL_STAFF=postgres://staff:staff-secret@127.0.0.1:5432/bersoncarebot_test
DATABASE_URL_NONSTAFF=postgres://nonstaff:nonstaff-secret@127.0.0.1:5432/bersoncarebot_test
`),
    },
    {
      basename: "api.fixture",
      path: "/tmp/api.fixture",
      processName: "integrator",
      values: parseEnvText(`
DB_PRINCIPAL_CONTEXT_MODE=shadow
DB_PRINCIPAL_SIGNING_SECRET=${sharedSecret}
DATABASE_URL=postgres://integrator:secret@127.0.0.1:5432/bersoncarebot_test
`),
    },
    {
      basename: "media.fixture",
      path: "/tmp/media.fixture",
      processName: "media-worker",
      values: parseEnvText(`
DB_PRINCIPAL_CONTEXT_MODE=shadow
DB_PRINCIPAL_SIGNING_SECRET="${sharedSecret}"
DATABASE_URL=postgres://media:secret@127.0.0.1:5432/bersoncarebot_test
`),
    },
  ];
  const summary = validateLoadedFiles(fixtureFiles);
  const output = renderReport(fixtureFiles, summary);
  assertNoSecretLeak(output, fixtureFiles);

  const broken = fixtureFiles.map((file) =>
    file.processName === "integrator"
      ? {
          ...file,
          values: new Map(file.values).set("DB_PRINCIPAL_SIGNING_SECRET", randomBytes(40).toString("base64url")),
        }
      : file,
  );
  try {
    validateLoadedFiles(broken);
  } catch {
    console.log("saas-c2-secret-preflight self-test: OK");
    return;
  }
  fail("self-test did not detect signing secret fingerprint mismatch");
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
  } else {
    process.stdout.write(runPreflightFromSpecs(options.envFiles));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`saas-c2-secret-preflight: ${message}`);
  process.exit(1);
}
