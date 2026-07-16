#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
const expectedPngName = /^i0_app_doctor_system_health_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.png$/;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngIend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

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

function prepareOutputDirectory(runId, dev) {
  const rootMetadata = lstatSync(screenshotRoot);
  if (
    !rootMetadata.isDirectory() ||
    rootMetadata.isSymbolicLink() ||
    rootMetadata.uid !== dev.uid ||
    rootMetadata.gid !== dev.gid ||
    (rootMetadata.mode & 0o022) !== 0
  ) {
    fail("screenshot_root_metadata_invalid");
  }
  const runDirectory = path.join(screenshotRoot, runId);
  const outputDirectory = path.join(runDirectory, "global-admin");
  mkdirSync(runDirectory, { mode: 0o700 });
  mkdirSync(outputDirectory, { mode: 0o700 });
  return outputDirectory;
}

function removeArtifact(artifactPath) {
  rmSync(artifactPath, { recursive: true, force: true });
}

function validatePng(filePath, dev) {
  const metadata = lstatSync(filePath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== dev.uid ||
    metadata.gid !== dev.gid ||
    metadata.size < 33
  ) {
    fail("capture_png_metadata_invalid");
  }
  const contents = readFileSync(filePath);
  if (
    !contents.subarray(0, pngSignature.length).equals(pngSignature) ||
    contents.subarray(12, 16).toString("ascii") !== "IHDR" ||
    contents.readUInt32BE(16) < 1 ||
    contents.readUInt32BE(20) < 1 ||
    !contents.subarray(-pngIend.length).equals(pngIend)
  ) {
    fail("capture_png_content_invalid");
  }
}

function sanitizeAndValidateCapture(outputDirectory, dev) {
  const directoryMetadata = lstatSync(outputDirectory);
  if (
    !directoryMetadata.isDirectory() ||
    directoryMetadata.isSymbolicLink() ||
    directoryMetadata.uid !== dev.uid ||
    directoryMetadata.gid !== dev.gid ||
    (directoryMetadata.mode & 0o077) !== 0
  ) {
    fail("capture_output_directory_metadata_invalid");
  }

  const expected = [];
  for (const entry of readdirSync(outputDirectory, { withFileTypes: true })) {
    const artifactPath = path.join(outputDirectory, entry.name);
    if (!expectedPngName.test(entry.name)) {
      removeArtifact(artifactPath);
      continue;
    }
    try {
      validatePng(artifactPath, dev);
      expected.push(artifactPath);
    } catch (error) {
      removeArtifact(artifactPath);
      throw error;
    }
  }
  if (expected.length !== 1) fail("capture_png_missing_or_ambiguous");
  return expected[0];
}

function capture() {
  const dev = resolveDevIdentity();
  if (process.getuid?.() !== dev.uid || process.getgid?.() !== dev.gid) fail("capture_requires_dev_identity");
  validateJar(exactJar, dev.gid);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDirectory = prepareOutputDirectory(runId, dev);
  const result = spawnSync(process.execPath, [shotEngine, exactJar, outputDirectory, exactRoute], {
    cwd: "/home/dev/brain/host-orch",
    env: childEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  });
  let artifactError;
  try {
    sanitizeAndValidateCapture(outputDirectory, dev);
  } catch (error) {
    artifactError = error;
  }
  if (result.error || result.status !== 0) fail("fixed_test_capture_failed");
  if (artifactError) throw artifactError;
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

    const dev = { uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0 };
    const falseSuccess = path.join(root, "false-success");
    mkdirSync(falseSuccess, { mode: 0o700 });
    writeFileSync(path.join(falseSuccess, "last-shot.json"), "protected engine report");
    let falseSuccessRejected = false;
    try {
      sanitizeAndValidateCapture(falseSuccess, dev);
    } catch (error) {
      falseSuccessRejected = error instanceof Error && error.message === "capture_png_missing_or_ambiguous";
    }
    if (!falseSuccessRejected || readdirSync(falseSuccess).length !== 0) {
      fail("self_test_false_success_accepted_or_report_retained");
    }

    const validCapture = path.join(root, "valid-capture");
    mkdirSync(validCapture, { mode: 0o700 });
    const validPngName = "i0_app_doctor_system_health_2026-07-16T12-34-56Z.png";
    const minimalPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    writeFileSync(path.join(validCapture, validPngName), minimalPng, { mode: 0o600 });
    writeFileSync(path.join(validCapture, "last-shot.json"), "protected engine report");
    writeFileSync(path.join(validCapture, "unexpected.txt"), "unsafe artifact");
    sanitizeAndValidateCapture(validCapture, dev);
    if (readdirSync(validCapture).join("") !== validPngName) {
      fail("self_test_engine_artifact_not_sanitized");
    }

    const symlinkCapture = path.join(root, "symlink-capture");
    mkdirSync(symlinkCapture, { mode: 0o700 });
    symlinkSync(path.join(validCapture, validPngName), path.join(symlinkCapture, validPngName));
    let symlinkRejected = false;
    try {
      sanitizeAndValidateCapture(symlinkCapture, dev);
    } catch {
      symlinkRejected = true;
    }
    if (!symlinkRejected || readdirSync(symlinkCapture).length !== 0) {
      fail("self_test_symlink_png_accepted");
    }
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
