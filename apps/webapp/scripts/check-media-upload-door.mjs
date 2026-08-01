#!/usr/bin/env node
/**
 * Structural gate for Ч1. It parses imports/calls rather than relying on an allowlist of old
 * violations: every intake must name the door, and only its adapter may call ready primitives.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(appRoot, 'src');
const apiRoot = path.join(sourceRoot, 'app', 'api');
const adapterPath = path.join(sourceRoot, 'app-layer', 'media', 'mediaUploadAdapter.ts');
const readyImplementationPaths = new Set([
  adapterPath,
  path.join(sourceRoot, 'infra', 'repos', 's3MediaStorage.ts'),
  path.join(sourceRoot, 'infra', 'repos', 'mediaUploadSessionsRepo.ts'),
]);
const forbiddenStorageBindings = new Set([
  'presignPutUrl',
  'presignUploadPartUrl',
  's3CreateMultipartUpload',
  's3CompleteMultipartUpload',
  's3PutObjectBody',
]);
const readyPrimitives = new Set([
  'confirmMediaFileReady',
  'confirmProgramSubmissionMediaFileReady',
  'tryFinalizeMultipartIdempotentTx',
]);

function isRawStorageSpecifier(specifier) {
  return (
    specifier.includes('/infra/s3/') ||
    specifier.startsWith('@aws-sdk/') ||
    /(?:^|\/)s3Client$/.test(specifier)
  );
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function hasDoorMarker(text) {
  return /\b(?:prepareMediaUpload|validateBufferedMediaUpload)\s*\(/.test(text);
}

function checkSource(filename, text) {
  const findings = [];
  const node = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isRoute = filename.endsWith(`${path.sep}route.ts`) || filename.endsWith('/route.ts');
  const inspect = (current) => {
    if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)) {
      const specifier = current.moduleSpecifier.text;
      const bindings = current.importClause?.namedBindings;
      if (specifier.includes('/infra/s3/') || specifier.startsWith('@aws-sdk/')) {
        if (isRoute) findings.push(`${filename}: route imports raw storage module ${specifier}`);
      }
      if (
        isRoute &&
        /(?:^|\/)s3Client$/.test(specifier) &&
        bindings &&
        ts.isNamespaceImport(bindings)
      ) {
        findings.push(`${filename}: route namespace-imports storage client`);
      }
      if (isRoute && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (forbiddenStorageBindings.has(element.propertyName?.text ?? element.name.text)) {
            findings.push(`${filename}: route imports storage write ${element.name.text}`);
          }
        }
      }
    }
    if (ts.isCallExpression(current)) {
      const expression = current.expression;
      if (
        expression.kind === ts.SyntaxKind.ImportKeyword &&
        current.arguments[0] &&
        ts.isStringLiteral(current.arguments[0]) &&
        isRawStorageSpecifier(current.arguments[0].text)
      ) {
        findings.push(`${filename}: dynamic raw storage import`);
      }
      if (
        ts.isIdentifier(expression) &&
        readyPrimitives.has(expression.text) &&
        !readyImplementationPaths.has(filename)
      ) {
        findings.push(
          `${filename}: ready primitive ${expression.text} bypasses mediaUploadAdapter`,
        );
      }
    }
    ts.forEachChild(current, inspect);
  };
  inspect(node);
  if (
    isRoute &&
    /(?:presignPutUrl|s3CreateMultipartUpload|request\.formData\s*\()/.test(text) &&
    !hasDoorMarker(text)
  ) {
    findings.push(`${filename}: intake route lacks media upload door marker`);
  }
  return findings;
}

function checkTree() {
  return walk(sourceRoot)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .flatMap((file) => checkSource(file, fs.readFileSync(file, 'utf8')));
}

function selfTest() {
  const fixtures = [
    [
      'virtual/api/new/route.ts',
      'export async function POST(request) { await request.formData(); }',
    ],
    [
      'virtual/route.ts',
      "import { confirmMediaFileReady } from '@/app-layer/media/s3MediaStorage'; confirmMediaFileReady();",
    ],
    [
      'virtual/route.ts',
      "import { presignPutUrl as p } from '../../infra/s3/client'; p('x', 'y');",
    ],
    ['virtual/route.ts', "import('@/infra/s3/client').then(() => undefined);"],
    [
      'virtual/route.ts',
      "import { PutObjectCommand } from '@aws-sdk/client-s3'; new PutObjectCommand({});",
    ],
  ];
  for (const [name, source] of fixtures) {
    if (checkSource(name, source).length === 0)
      throw new Error(`self-test stayed green: ${source}`);
  }
  console.log(
    'media upload door self-test: OK (fifth/seventh, ready, relative, dynamic, SDK all red)',
  );
}

if (process.argv.includes('--self-test')) selfTest();
const findings = checkTree();
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log('media upload door: OK');
}
