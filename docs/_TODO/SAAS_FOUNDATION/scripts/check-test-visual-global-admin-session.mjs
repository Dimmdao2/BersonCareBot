#!/usr/bin/env node
import { sourceTextIncludes, sourceTextIndexOf } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';

const files = {
  helper: 'deploy/host/test-visual-global-admin-session.mjs',
  capture: 'deploy/host/capture-test-global-admin-system-health.mjs',
  cookie: 'apps/webapp/src/modules/auth/sessionCookie.ts',
  cookieTest: 'apps/webapp/src/modules/auth/sessionCookie.test.ts',
  types: 'apps/webapp/src/shared/types/session.ts',
  // PLAT-01…09 slice 1 (2026-07-26): system-health moved from `(global-admin)/doctor/` to its
  // own `/app/admin/*` shell. `globalAdminLayout` now points at the layout that actually
  // governs this page (`app/admin/layout.tsx`) — the old path this pointed at
  // (`(global-admin)/doctor/system-health/layout.tsx`) never existed as a real file.
  globalAdminLayout: 'apps/webapp/src/app/app/admin/layout.tsx',
  globalAdminPage: 'apps/webapp/src/app/app/admin/system-health/page.tsx',
  runbook: 'docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/TEST_VISUAL_GLOBAL_ADMIN_SESSION.md',
  package: 'package.json',
};

function load() {
  return Object.fromEntries(
    Object.entries(files).map(([key, file]) => [key, readFileSync(file, 'utf8')]),
  );
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!sourceTextIncludes(text, fragment, label))
      throw new Error(`${label}: missing ${fragment}`);
  }
}

function requireOrdered(label, text, fragments) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = sourceTextIndexOf(text, fragment, label, cursor + 1);
    if (next < 0) throw new Error(`${label}: missing ordered ${fragment}`);
    cursor = next;
  }
}

function validate(source) {
  requireFragments(files.helper, source.helper, [
    'const testBaseUrl = "http://127.0.0.1:6300"',
    'const fixturePacketPath = "/opt/env/bersoncarebot/saas-test-fixture.env"',
    'databaseName !== "bersoncarebot_test"',
    'parsedDatabaseUrl.hostname !== "127.0.0.1"',
    '(parsedDatabaseUrl.port || "5432") !== "5432"',
    'duplicate_env_key:',
    'if (!match) fail("malformed_env_line")',
    'webapp_test_env_metadata_must_be_root_deploy_0640',
    'properties.get("WorkingDirectory") !== "/opt/projects/bersoncarebot-test/apps/webapp/.next/standalone/apps/webapp"',
    'const listeners = parseSsListenerRecords(listenerProof)',
    'listener.localAddress === "127.0.0.1:6300" && expectedPid.test(listener.process)',
    'self_test_cross_record_listener_identity_accepted',
    'process.getuid?.() !== 0',
    'ttlSeconds < minTtlSeconds || ttlSeconds > maxTtlSeconds',
    'active_handoff_exists_revoke_first',
    'handoff_directory_metadata_postcondition_failed',
    'operatorSession: { purpose, expiresAt }',
    'metadata.uid !== uid || metadata.gid !== gid',
    'modeBody?.ok !== true || modeBody.adminMode !== true',
    'rmSync(filePath)',
    'self_test_overwrite_accepted',
    'self_test_symlink_directory_accepted',
    'self_test_secret_leaked_in_error',
  ]);
  requireOrdered(`${files.helper} ordinary auth order`, source.helper, [
    '/api/auth/email-password/login',
    '/api/admin/mode',
    'boundAdminSession(adminCookie',
    'writeJar({ filePath: outputPath',
  ]);
  for (const forbidden of [
    '/run/bersoncarebot/saas-smoke.fixture',
    '/api/auth/dev-bypass',
    '/api/auth/dev-public',
    'bcb_webapp_prod',
    'bcb_webapp_dev',
  ]) {
    if (sourceTextIncludes(source.helper, forbidden, files.helper)) {
      throw new Error(`helper: forbidden ${forbidden}`);
    }
  }
  requireFragments(files.capture, source.capture, [
    'const exactBase = "https://test.bersoncare.ru"',
    'const exactCookieHost = "test.bersoncare.ru"',
    'const exactRoute = "/app/admin/system-health"',
    'const exactJar = "/run/bersoncarebot-visual/global-admin.cookies"',
    'fields[3] !== "TRUE"',
    'fields[0] !== exactCookieHost',
    'process.getuid?.() !== dev.uid',
    'spawnSync(process.execPath, [shotEngine, exactJar, outputDirectory, exactRoute]',
    'env: childEnvironment()',
    '    sanitizeAndValidateCapture(outputDirectory, dev);',
    'capture_png_missing_or_ambiguous',
    'capture_png_content_invalid',
    'contents.readUInt32BE(dataEnd) !== pngCrc32(contents, typeStart, dataEnd)',
    'width > maxPngDimension',
    'contents[dataStart + 12] !== 0',
    'decodedBytes > BigInt(maxDecodedPngBytes)',
    'inflated = inflateSync(Buffer.concat(idatParts, idatBytes), {',
    'maxOutputLength: ihdr.decodedBytes',
    'inflated.engine.bytesWritten !== idatBytes || decoded.length !== ihdr.decodedBytes',
    'decoded[rowOffset] > 4',
    'if (type !== "IHDR" || length !== 13)',
    'if (idatSequenceEnded || (ihdr.colorType === 3 && !sawPalette))',
    'if (length !== 0 || !sawIdat || idatBytes === 0 || chunkEnd !== contents.length)',
    'self_test_false_success_accepted_or_report_retained',
    'self_test_engine_artifact_not_sanitized',
    'assertInvalidPng("crafted_36_byte", crafted36BytePng)',
    'assertInvalidPng("idat_crc_mismatch", crcMismatch)',
    'assertInvalidPng("truncated", minimalPng.subarray(0, minimalPng.length - 1))',
    'assertInvalidPng("trailing_data", Buffer.concat([minimalPng, Buffer.from([0])]))',
    'assertInvalidPng("wrong_ihdr_length", Buffer.concat([',
    'assertInvalidPng("missing_idat", Buffer.concat([pngSignature, validIhdr, validIend]))',
    'assertInvalidPng("empty_idat", Buffer.concat([pngSignature, validIhdr, pngChunk("IDAT", Buffer.alloc(0)), validIend]))',
    'assertInvalidPng("nonempty_iend", Buffer.concat([',
    'assertInvalidPng("ihdr_not_first", Buffer.concat([',
    'assertInvalidPng("invalid_zlib_stream", Buffer.concat([',
    'assertInvalidPng("wrong_decoded_length", Buffer.concat([',
    'assertInvalidPng("invalid_scanline_filter", Buffer.concat([',
    'assertInvalidPng("oversized_dimension", Buffer.concat([',
    'assertInvalidPng("decoded_resource_bomb", Buffer.concat([',
    'self_test_symlink_png_accepted',
    'if (extraArguments.length > 0) fail("arguments_forbidden")',
    '"NODE_OPTIONS" in env',
    'self_test_unsafe_cookie_scope_accepted',
    'self_test_stdout_secret_leak',
    'async function probeFixedNavigation(cookie, request = fetch)',
    'next.origin !== exactBase',
    'next.search = ""',
    'category: "redirect_loop"',
    'fixed_navigation_${diagnostic.category}',
  ]);
  for (const forbidden of [
    'process.env.BASE',
    'process.env.CHROME',
    'process.argv[3]',
    'http://127.0.0.1:5200',
    'https://bersoncare.ru',
  ]) {
    if (sourceTextIncludes(source.capture, forbidden, files.capture)) {
      throw new Error(`capture: forbidden ${forbidden}`);
    }
  }
  requireFragments(files.cookie, source.cookie, [
    'operatorSession === null',
    'operatorSession.purpose !== "test_global_admin_visual"',
    'operatorSession.expiresAt !== parsed.expiresAt',
    'session.operatorSession?.purpose === "test_global_admin_visual") return false',
    'session.operatorSession?.purpose === "test_global_admin_visual") return session',
  ]);
  requireFragments(files.types, source.types, [
    'operatorSession?:',
    'purpose: "test_global_admin_visual"',
  ]);
  // 2026-07-26: the platform console moved to /app/admin and the layout guard was reconciled.
  // The layout is now guarded by requirePlatformOperationsPage(), which is STRICTLY STRONGER than the
  // old requireGlobalAdminDoctorPage() this used to assert here: it additionally enforces the 2FA
  // restricted-session gate and stamps the platform DB principal (without which every settings page
  // 42501s on system_settings). The page-level requireGlobalAdminDoctorPage() assertion below is kept
  // — defence in depth, both guards are real and both are asserted, just in their actual files.
  requireFragments(files.globalAdminLayout, source.globalAdminLayout, [
    'requirePlatformOperationsPage()',
    '<DoctorWorkspaceShell',
    'adminMode={true}',
  ]);
  if (
    sourceTextIncludes(
      source.globalAdminLayout,
      'requireDoctorWorkspaceContext',
      files.globalAdminLayout,
    )
  ) {
    throw new Error('global admin layout: tenant workspace dependency forbidden');
  }
  requireFragments(files.globalAdminPage, source.globalAdminPage, [
    'requireGlobalAdminDoctorPage()',
    '<SystemHealthSection />',
  ]);
  requireFragments(files.cookieTest, source.cookieTest, [
    'keeps a bounded TEST visual session non-renewable',
    'rejects a bounded marker whose expiry differs',
    'rejects a malformed bounded marker without throwing',
  ]);
  requireFragments(files.runbook, source.runbook, [
    'root:dev 0750',
    'root:dev 0640',
    'issue --ttl-seconds 1800',
    'test-visual-global-admin-session.mjs revoke',
    'stateless HMAC cookies',
    'Do not copy `last-shot.json`',
    'capture-test-global-admin-system-health.mjs capture',
    'Direct invocation of `/home/dev/brain/host-orch/shot.mjs`',
    'exact `127.0.0.1:5432/bersoncarebot_test`',
  ]);
  if (sourceTextIncludes(source.runbook, 'BASE=https://', files.runbook)) {
    throw new Error('runbook: arbitrary BASE invocation forbidden');
  }
  requireFragments(files.package, source.package, ['check:test-visual-global-admin-session']);
}

function selfTest(source) {
  const mutations = [
    ['non-TEST target', 'bersoncarebot_test', 'bcb_webapp_prod'],
    [
      'renewable bounded session',
      'if (session.operatorSession?.purpose === "test_global_admin_visual") return false;',
      'if (session.operatorSession?.purpose === "test_global_admin_visual") return true;',
    ],
    ['missing admin mode', 'modeBody.adminMode !== true', 'modeBody.adminMode === true'],
    ['missing revoke', 'rmSync(filePath)', 'void filePath'],
    [
      'wrong database host',
      'parsedDatabaseUrl.hostname !== "127.0.0.1"',
      'parsedDatabaseUrl.hostname !== "db.example.test"',
    ],
    [
      'wrong database port',
      '(parsedDatabaseUrl.port || "5432") !== "5432"',
      '(parsedDatabaseUrl.port || "5432") !== "5433"',
    ],
    ['malformed env accepted', 'if (!match) fail("malformed_env_line")', 'if (!match) continue'],
    [
      'cross-record listener accepted',
      'listener.localAddress === "127.0.0.1:6300" && expectedPid.test(listener.process)',
      'listener.localAddress === "127.0.0.1:6300" || expectedPid.test(listener.process)',
    ],
    [
      'origin drift',
      'const exactBase = "https://test.bersoncare.ru"',
      'const exactBase = "https://evil.example"',
    ],
    [
      'cookie exfiltration domain',
      'const exactCookieHost = "test.bersoncare.ru"',
      'const exactCookieHost = "evil.example"',
    ],
    ['navigation probe cross-origin bypass', 'next.origin !== exactBase', 'false'],
    [
      'capture artifact validation bypassed',
      '    sanitizeAndValidateCapture(outputDirectory, dev);',
      '    void outputDirectory;',
    ],
    [
      'PNG CRC validation bypassed',
      'contents.readUInt32BE(dataEnd) !== pngCrc32(contents, typeStart, dataEnd)',
      'false',
    ],
    [
      'PNG first IHDR contract bypassed',
      'if (type !== "IHDR" || length !== 13)',
      'if (type !== "IHDR" && length !== 13)',
    ],
    [
      'PNG IDAT requirement bypassed',
      'if (length !== 0 || !sawIdat || idatBytes === 0 || chunkEnd !== contents.length)',
      'if (length !== 0 || chunkEnd !== contents.length)',
    ],
    ['PNG exact EOF bypassed', 'chunkEnd !== contents.length', 'chunkEnd > contents.length'],
    ['PNG dimension bound bypassed', 'width > maxPngDimension', 'false'],
    ['PNG interlace rejection bypassed', 'contents[dataStart + 12] !== 0', 'false'],
    ['PNG decoded resource bound bypassed', 'decodedBytes > BigInt(maxDecodedPngBytes)', 'false'],
    [
      'PNG IDAT decompression bypassed',
      'inflated = inflateSync(Buffer.concat(idatParts, idatBytes), {',
      'inflated = { buffer: Buffer.alloc(ihdr.decodedBytes), engine: { bytesWritten: idatBytes } }; void ({',
    ],
    [
      'PNG decoded length bypassed',
      'inflated.engine.bytesWritten !== idatBytes || decoded.length !== ihdr.decodedBytes',
      'false',
    ],
    ['PNG scanline filter bypassed', 'decoded[rowOffset] > 4', 'false'],
  ];
  for (const [label, before, after] of mutations) {
    const mutated = { ...source };
    const target =
      label === 'renewable bounded session'
        ? 'cookie'
        : label === 'origin drift' ||
            label === 'cookie exfiltration domain' ||
            label.startsWith('navigation probe') ||
            label.startsWith('capture artifact') ||
            label.startsWith('PNG ')
          ? 'capture'
          : 'helper';
    mutated[target] = mutated[target].replace(before, after);
    let rejected = false;
    try {
      validate(mutated);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`self-test accepted mutation: ${label}`);
  }
}

const source = load();
validate(source);
if (process.argv.includes('--self-test')) selfTest(source);
process.stdout.write(
  `test visual global-admin session checker: PASS${process.argv.includes('--self-test') ? ' (self-test)' : ''}\n`,
);
