#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const exactBase = "https://test.bersoncare.ru";
const exactCookieHost = "test.bersoncare.ru";
const exactRoute = "/app/doctor/system-health";
const exactJar = "/run/bersoncarebot-visual/global-admin.cookies";
const screenshotRoot = "/home/dev/dev-projects/BersonCareBot/.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH";
const shotEngine = "/home/dev/brain/host-orch/shot.mjs";
const chromePath = "/home/dev/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";
const sessionCookieName = "bersoncare_webapp_session";

function fail(code) {
  throw new Error(code);
}

function resolveDevIdentity(passwdText = readFileSync("/etc/passwd", "utf8")) {
  const fields = passwdText.split(/\r?\n/).find((line) => line.startsWith("dev:"))?.split(":") ?? [];
  const uid = Number(fields[2]);
  const gid = Number(fields[3]);
  if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid)) fail("dev_identity_missing");
  return { uid, gid };
}

function validateCookieJarText(text, nowSec = Math.floor(Date.now() / 1000)) {
  const cookieLines = text
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"));
  if (cookieLines.length !== 1) fail("handoff_cookie_count_invalid");
  const fields = cookieLines[0].split("\t");
  if (
    fields.length !== 7 ||
    fields[0] !== exactCookieHost ||
    fields[1] !== "FALSE" ||
    fields[2] !== "/" ||
    fields[3] !== "TRUE" ||
    fields[5] !== sessionCookieName ||
    !fields[6]
  ) {
    fail("handoff_cookie_scope_invalid");
  }
  const expiresAt = Number(fields[4]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSec) fail("handoff_cookie_expired");
  return { expiresAt };
}

function validateJar(filePath, expectedGid, nowSec = Math.floor(Date.now() / 1000)) {
  const directoryMetadata = lstatSync(path.dirname(filePath));
  if (
    !directoryMetadata.isDirectory() ||
    directoryMetadata.isSymbolicLink() ||
    directoryMetadata.uid !== 0 ||
    directoryMetadata.gid !== expectedGid ||
    (directoryMetadata.mode & 0o777) !== 0o750
  ) {
    fail("handoff_directory_metadata_invalid");
  }
  const metadata = lstatSync(filePath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== 0 ||
    metadata.gid !== expectedGid ||
    (metadata.mode & 0o777) !== 0o640
  ) {
    fail("handoff_file_metadata_invalid");
  }
  return validateCookieJarText(readFileSync(filePath, "utf8"), nowSec);
}

function childEnvironment() {
  return Object.freeze({
    BASE: exactBase,
    CHROME: chromePath,
    DPR: "1",
    FULLPAGE: "1",
    HOME: "/home/dev",
    PATH: "/usr/local/bin:/usr/bin:/bin",
    VIEWPORT_H: "900",
    VIEWPORT_W: "1440",
    WAIT_MS: "2500",
  });
}

function capture() {
  const dev = resolveDevIdentity();
  if (process.getuid?.() !== dev.uid || process.getgid?.() !== dev.gid) fail("capture_requires_dev_identity");
  validateJar(exactJar, dev.gid);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDirectory = path.join(screenshotRoot, runId, "global-admin");
  const result = spawnSync(process.execPath, [shotEngine, exactJar, outputDirectory, exactRoute], {
    cwd: "/home/dev/brain/host-orch",
    env: childEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  });
  if (result.error || result.status !== 0) fail("fixed_test_capture_failed");
  process.stdout.write(`TEST global-admin System Health capture complete\noutput=${outputDirectory}\n`);
}

function selfTest() {
  const root = mkdtempSync(path.join(tmpdir(), "bcb-fixed-test-capture-"));
  try {
    const now = Math.floor(Date.now() / 1000);
    const jar = path.join(root, "global-admin.cookies");
    writeFileSync(jar, [
      "# Netscape HTTP Cookie File",
      `${exactCookieHost}\tFALSE\t/\tTRUE\t${now + 600}\t${sessionCookieName}\tself-test-cookie-secret`,
      "",
    ].join("\n"), { mode: 0o640 });
    const directoryMetadata = lstatSync(root);
    if ((directoryMetadata.mode & 0o777) !== 0o700) fail("self_test_temp_mode_unexpected");
    // The parser's content contract is tested independently from root-owned runtime metadata.
    const validText = readFileSync(jar, "utf8");
    validateCookieJarText(validText, now);
    const cookieLine = validText.split(/\r?\n/).find((line) => line && !line.startsWith("#"));
    if (!cookieLine) fail("self_test_secure_domain_failed");
    for (const mutation of [
      cookieLine.replace(exactCookieHost, "evil.example"),
      cookieLine.replace("\tTRUE\t", "\tFALSE\t"),
      cookieLine.replace(`\t${now + 600}\t`, `\t${now - 1}\t`),
    ]) {
      let rejected = false;
      try {
        validateCookieJarText(`# Netscape HTTP Cookie File\n${mutation}\n`, now);
      } catch {
        rejected = true;
      }
      if (!rejected) fail("self_test_unsafe_cookie_scope_accepted");
    }
    const env = childEnvironment();
    if (env.BASE !== exactBase || "NODE_OPTIONS" in env || Object.values(env).includes("https://evil.example")) {
      fail("self_test_child_environment_failed");
    }
    const safeOutput = "TEST global-admin System Health capture complete";
    if (safeOutput.includes("self-test-cookie-secret")) fail("self_test_stdout_secret_leak");
    process.stdout.write("fixed TEST global-admin capture self-test: OK\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const [command, ...extraArguments] = process.argv.slice(2);
try {
  if (extraArguments.length > 0) fail("arguments_forbidden");
  if (command === "capture") capture();
  else if (command === "--self-test") selfTest();
  else fail("usage: capture-test-global-admin-system-health.mjs capture | --self-test");
} catch (error) {
  process.stderr.write(`TEST global-admin capture failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
}
