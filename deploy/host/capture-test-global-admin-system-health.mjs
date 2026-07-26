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
import { deflateSync, inflateSync } from "node:zlib";

const exactBase = "https://test.bersoncare.ru";
const exactCookieHost = "test.bersoncare.ru";
// PLAT-01…09 slice 1 (2026-07-26): system-health moved to its own platform shell.
const exactRoute = "/app/platform/system-health";
const exactJar = "/run/bersoncarebot-visual/global-admin.cookies";
const screenshotRoot = "/home/dev/dev-projects/BersonCareBot/.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH";
const shotEngine = "/home/dev/brain/host-orch/shot.mjs";
const chromePath = "/home/dev/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";
const sessionCookieName = "bersoncare_webapp_session";
const expectedPngName = /^i0_app_platform_system_health_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.png$/;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxPngBytes = 256 * 1024 * 1024;
const maxDecodedPngBytes = 512 * 1024 * 1024;
const maxPngDimension = 0x7fffffff;
const pngCrcTable = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
}));

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
  return { cookie: fields[6], expiresAt };
}

function normalizedDiagnosticPath(url) {
  if (url.pathname === exactRoute || url.pathname === "/app/doctor" || url.pathname === "/app") {
    return url.pathname;
  }
  return "/other";
}

function terminalNavigationCategory(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "auth_required";
  if (status === 403) return "forbidden";
  if (status >= 500) return "server_error";
  if (status >= 300 && status < 400) return "redirect_unresolved";
  return "http_error";
}

async function probeFixedNavigation(cookie, request = fetch) {
  let current = new URL(exactRoute, exactBase);
  let lastStatus = null;
  const visited = new Set();
  for (let redirectCount = 0; redirectCount <= 12; redirectCount += 1) {
    if (visited.has(current.href)) {
      return { origin: exactBase, path: normalizedDiagnosticPath(current), status: lastStatus, category: "redirect_loop" };
    }
    visited.add(current.href);
    let response;
    try {
      response = await request(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: { Cookie: `${sessionCookieName}=${cookie}` },
      });
    } catch {
      return { origin: exactBase, path: normalizedDiagnosticPath(current), status: null, category: "network_error" };
    }
    const status = response.status;
    lastStatus = status;
    if (status < 300 || status >= 400) {
      return {
        origin: exactBase,
        path: normalizedDiagnosticPath(current),
        status,
        category: terminalNavigationCategory(status),
      };
    }
    const location = response.headers.get("location");
    if (!location) {
      return { origin: exactBase, path: normalizedDiagnosticPath(current), status, category: "redirect_missing_location" };
    }
    let next;
    try {
      next = new URL(location, current);
    } catch {
      return { origin: exactBase, path: normalizedDiagnosticPath(current), status, category: "redirect_invalid_location" };
    }
    if (next.origin !== exactBase) {
      return { origin: exactBase, path: normalizedDiagnosticPath(current), status, category: "cross_origin_redirect" };
    }
    next.search = "";
    next.hash = "";
    current = next;
  }
  return { origin: exactBase, path: normalizedDiagnosticPath(current), status: lastStatus, category: "redirect_limit" };
}

function printNavigationDiagnostic(diagnostic) {
  const status = diagnostic.status === null ? "none" : String(diagnostic.status);
  process.stdout.write(
    `navigation origin=${diagnostic.origin} path=${diagnostic.path} status=${status} category=${diagnostic.category}\n`,
  );
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

function pngCrc32(contents, start, end) {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc = pngCrcTable[(crc ^ contents[offset]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateIhdr(contents, dataStart) {
  const width = contents.readUInt32BE(dataStart);
  const height = contents.readUInt32BE(dataStart + 4);
  const bitDepth = contents[dataStart + 8];
  const colorType = contents[dataStart + 9];
  const validBitDepths = new Map([
    [0, new Set([1, 2, 4, 8, 16])],
    [2, new Set([8, 16])],
    [3, new Set([1, 2, 4, 8])],
    [4, new Set([8, 16])],
    [6, new Set([8, 16])],
  ]);
  if (
    width < 1 ||
    height < 1 ||
    width > maxPngDimension ||
    height > maxPngDimension ||
    !validBitDepths.get(colorType)?.has(bitDepth) ||
    contents[dataStart + 10] !== 0 ||
    contents[dataStart + 11] !== 0 ||
    contents[dataStart + 12] !== 0
  ) {
    fail("capture_png_content_invalid");
  }
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  if (!channels) fail("capture_png_content_invalid");
  const rowBytes = (BigInt(width) * BigInt(channels * bitDepth) + 7n) / 8n;
  const decodedBytes = (rowBytes + 1n) * BigInt(height);
  if (decodedBytes > BigInt(maxDecodedPngBytes) || decodedBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("capture_png_content_invalid");
  }
  return { colorType, decodedBytes: Number(decodedBytes), height, rowBytes: Number(rowBytes) };
}

function validateDecodedIdat(idatParts, idatBytes, ihdr) {
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idatParts, idatBytes), {
      info: true,
      maxOutputLength: ihdr.decodedBytes,
    });
  } catch {
    fail("capture_png_content_invalid");
  }
  const decoded = inflated.buffer;
  if (inflated.engine.bytesWritten !== idatBytes || decoded.length !== ihdr.decodedBytes) {
    fail("capture_png_content_invalid");
  }
  const rowStride = ihdr.rowBytes + 1;
  for (let row = 0; row < ihdr.height; row += 1) {
    const rowOffset = row * rowStride;
    if (decoded[rowOffset] > 4) fail("capture_png_content_invalid");
  }
}

function validatePngContents(contents) {
  if (
    contents.length < 58 ||
    contents.length > maxPngBytes ||
    !contents.subarray(0, pngSignature.length).equals(pngSignature)
  ) {
    fail("capture_png_content_invalid");
  }

  let offset = pngSignature.length;
  let chunkIndex = 0;
  let ihdr;
  let sawPalette = false;
  let sawIdat = false;
  let idatBytes = 0;
  const idatParts = [];
  let idatSequenceEnded = false;

  while (offset < contents.length) {
    if (contents.length - offset < 12) fail("capture_png_content_invalid");
    const length = contents.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (length > 0x7fffffff || dataEnd < dataStart || chunkEnd > contents.length) {
      fail("capture_png_content_invalid");
    }

    const typeBytes = contents.subarray(typeStart, dataStart);
    if (
      typeBytes.length !== 4 ||
      !typeBytes.every((byte) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)) ||
      typeBytes[2] < 0x41 ||
      typeBytes[2] > 0x5a
    ) {
      fail("capture_png_content_invalid");
    }
    const type = typeBytes.toString("ascii");
    if (contents.readUInt32BE(dataEnd) !== pngCrc32(contents, typeStart, dataEnd)) {
      fail("capture_png_content_invalid");
    }

    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) fail("capture_png_content_invalid");
      ihdr = validateIhdr(contents, dataStart);
    } else if (type === "IHDR") {
      fail("capture_png_content_invalid");
    } else if (type === "PLTE") {
      if (sawPalette || sawIdat || length === 0 || length % 3 !== 0 || length > 768 || ihdr.colorType === 0 || ihdr.colorType === 4) {
        fail("capture_png_content_invalid");
      }
      sawPalette = true;
    } else if (type === "IDAT") {
      if (idatSequenceEnded || (ihdr.colorType === 3 && !sawPalette)) fail("capture_png_content_invalid");
      sawIdat = true;
      idatBytes += length;
      idatParts.push(contents.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (length !== 0 || !sawIdat || idatBytes === 0 || chunkEnd !== contents.length) {
        fail("capture_png_content_invalid");
      }
      validateDecodedIdat(idatParts, idatBytes, ihdr);
      return;
    } else {
      if (sawIdat) idatSequenceEnded = true;
      if (typeBytes[0] >= 0x41 && typeBytes[0] <= 0x5a) fail("capture_png_content_invalid");
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }
  fail("capture_png_content_invalid");
}

function validatePng(filePath, dev) {
  const metadata = lstatSync(filePath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== dev.uid ||
    metadata.gid !== dev.gid ||
    metadata.size < 58 ||
    metadata.size > maxPngBytes
  ) {
    fail("capture_png_metadata_invalid");
  }
  validatePngContents(readFileSync(filePath));
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

async function capture() {
  const dev = resolveDevIdentity();
  if (process.getuid?.() !== dev.uid || process.getgid?.() !== dev.gid) fail("capture_requires_dev_identity");
  const { cookie } = validateJar(exactJar, dev.gid);
  const diagnostic = await probeFixedNavigation(cookie);
  printNavigationDiagnostic(diagnostic);
  if (diagnostic.category !== "ok" || diagnostic.status !== 200 || diagnostic.path !== exactRoute) {
    fail(`fixed_navigation_${diagnostic.category}`);
  }
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

async function selfTest() {
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
    const parsedCookie = validateCookieJarText(validText, now);
    if (parsedCookie.cookie !== "self-test-cookie-secret") fail("self_test_cookie_parse_failed");
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

    const response = (status, location) => ({
      status,
      headers: { get: (name) => name === "location" ? location ?? null : null },
    });
    const okProbe = await probeFixedNavigation("self-test-cookie-secret", async () => response(200));
    if (okProbe.category !== "ok" || okProbe.path !== exactRoute || okProbe.status !== 200) {
      fail("self_test_navigation_ok_failed");
    }
    const loopResponses = [response(307, "/app/doctor"), response(307, exactRoute)];
    const loopProbe = await probeFixedNavigation("self-test-cookie-secret", async () => loopResponses.shift());
    if (loopProbe.category !== "redirect_loop" || loopProbe.path !== exactRoute) {
      fail("self_test_navigation_loop_failed");
    }
    const crossOriginProbe = await probeFixedNavigation(
      "self-test-cookie-secret",
      async () => response(307, "https://evil.example/path?secret=must-not-appear"),
    );
    if (crossOriginProbe.category !== "cross_origin_redirect" || crossOriginProbe.path !== exactRoute) {
      fail("self_test_navigation_cross_origin_failed");
    }
    if (JSON.stringify(crossOriginProbe).includes("secret") || JSON.stringify(crossOriginProbe).includes("evil")) {
      fail("self_test_navigation_diagnostic_leaked_location");
    }

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
    const validPngName = "i0_app_platform_system_health_2026-07-16T12-34-56Z.png";
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

    const assertInvalidPng = (label, contents) => {
      let rejected = false;
      try {
        validatePngContents(contents);
      } catch (error) {
        rejected = error instanceof Error && error.message === "capture_png_content_invalid";
      }
      if (!rejected) fail(`self_test_invalid_png_accepted:${label}`);
    };
    const pngChunk = (type, data) => {
      const chunk = Buffer.alloc(data.length + 12);
      chunk.writeUInt32BE(data.length, 0);
      chunk.write(type, 4, "ascii");
      data.copy(chunk, 8);
      chunk.writeUInt32BE(pngCrc32(chunk, 4, 8 + data.length), 8 + data.length);
      return chunk;
    };
    const validIhdr = minimalPng.subarray(8, 33);
    const idatLength = minimalPng.readUInt32BE(33);
    const validIdat = minimalPng.subarray(33, 33 + idatLength + 12);
    const validIend = minimalPng.subarray(minimalPng.length - 12);
    const validIhdrData = minimalPng.subarray(16, 29);
    const validIdatData = minimalPng.subarray(41, 41 + idatLength);
    validatePngContents(Buffer.concat([
      pngSignature,
      validIhdr,
      pngChunk("IDAT", validIdatData.subarray(0, 5)),
      pngChunk("IDAT", validIdatData.subarray(5)),
      validIend,
    ]));
    const chromiumStyleIhdrData = Buffer.from(validIhdrData);
    chromiumStyleIhdrData.writeUInt32BE(2, 0);
    chromiumStyleIhdrData.writeUInt32BE(2, 4);
    chromiumStyleIhdrData[8] = 8;
    chromiumStyleIhdrData[9] = 6;
    const chromiumStyleRows = Buffer.from([
      0, 255, 255, 255, 255, 0, 0, 0, 255,
      4, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    validatePngContents(Buffer.concat([
      pngSignature,
      pngChunk("IHDR", chromiumStyleIhdrData),
      pngChunk("IDAT", deflateSync(chromiumStyleRows)),
      validIend,
    ]));
    const crafted36BytePng = Buffer.alloc(36);
    pngSignature.copy(crafted36BytePng);
    crafted36BytePng.write("IHDR", 12, "ascii");
    crafted36BytePng.writeUInt32BE(1, 16);
    crafted36BytePng.writeUInt32BE(1, 20);
    Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]).copy(crafted36BytePng, 24);
    assertInvalidPng("crafted_36_byte", crafted36BytePng);
    const crcMismatch = Buffer.from(minimalPng);
    crcMismatch[41] ^= 1;
    assertInvalidPng("idat_crc_mismatch", crcMismatch);
    assertInvalidPng("truncated", minimalPng.subarray(0, minimalPng.length - 1));
    assertInvalidPng("trailing_data", Buffer.concat([minimalPng, Buffer.from([0])]));
    assertInvalidPng("wrong_ihdr_length", Buffer.concat([
      pngSignature,
      pngChunk("IHDR", Buffer.alloc(12)),
      validIdat,
      validIend,
    ]));
    assertInvalidPng("missing_idat", Buffer.concat([pngSignature, validIhdr, validIend]));
    assertInvalidPng("empty_idat", Buffer.concat([pngSignature, validIhdr, pngChunk("IDAT", Buffer.alloc(0)), validIend]));
    assertInvalidPng("nonempty_iend", Buffer.concat([
      pngSignature,
      validIhdr,
      validIdat,
      pngChunk("IEND", Buffer.from([0])),
    ]));
    assertInvalidPng("ihdr_not_first", Buffer.concat([
      pngSignature,
      validIdat,
      validIhdr,
      validIend,
    ]));
    assertInvalidPng("invalid_zlib_stream", Buffer.concat([
      pngSignature,
      validIhdr,
      pngChunk("IDAT", Buffer.from([0])),
      validIend,
    ]));
    assertInvalidPng("wrong_decoded_length", Buffer.concat([
      pngSignature,
      validIhdr,
      pngChunk("IDAT", deflateSync(Buffer.from([0, 0]))),
      validIend,
    ]));
    assertInvalidPng("invalid_scanline_filter", Buffer.concat([
      pngSignature,
      validIhdr,
      pngChunk("IDAT", deflateSync(Buffer.from([5, 0, 0]))),
      validIend,
    ]));
    const oversizedIhdrData = Buffer.from(validIhdrData);
    oversizedIhdrData.writeUInt32BE(0x80000000, 0);
    assertInvalidPng("oversized_dimension", Buffer.concat([
      pngSignature,
      pngChunk("IHDR", oversizedIhdrData),
      validIdat,
      validIend,
    ]));
    const bombIhdrData = Buffer.from(validIhdrData);
    bombIhdrData.writeUInt32BE(20_000, 0);
    bombIhdrData.writeUInt32BE(20_000, 4);
    bombIhdrData[9] = 6;
    assertInvalidPng("decoded_resource_bomb", Buffer.concat([
      pngSignature,
      pngChunk("IHDR", bombIhdrData),
      validIdat,
      validIend,
    ]));

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
  if (command === "capture") await capture();
  else if (command === "--self-test") await selfTest();
  else fail("usage: capture-test-global-admin-system-health.mjs capture | --self-test");
} catch (error) {
  process.stderr.write(`TEST global-admin capture failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
}
