#!/usr/bin/env node
/**
 * Structural gate for Ч1: public media intake must enter through the closed
 * intent/received-object door, and routes cannot reach storage/state primitives directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(appRoot, 'src');
const adapterPath = path.join(sourceRoot, 'app-layer', 'media', 'mediaUploadAdapter.ts');
const storageAdapterPath = path.join(sourceRoot, 'app-layer', 'media', 's3Client.ts');
const repoRoot = path.join(sourceRoot, 'infra', 'repos');
const infraStorageRoot = path.join(sourceRoot, 'infra', 's3');

const intentDoorBindings = new Set([
  'prepareMediaUpload',
  'validateUploadIntent',
  'validateBufferedMediaUpload',
  'validateReceivedMediaObject',
]);
const receivedDoorBindings = new Set([
  'validateBufferedMediaUpload',
  'validateReceivedMediaObject',
]);
const preparedWriteBindings = new Set(['presignPreparedUpload', 'beginPreparedMultipartUpload']);
const multipartCompletionBindings = new Set(['completePreparedMultipartUpload']);
const receivedAcceptanceBindings = new Set([
  'acceptReceivedMedia',
  'acceptReceivedProgramSubmission',
  'finalizeReceivedMultipart',
]);
const statePrimitives = new Set([
  'insertPendingMediaFileTx',
  'insertPendingProgramSubmissionMediaFileTx',
  'confirmMediaFileReady',
  'confirmProgramSubmissionMediaFileReady',
  'tryFinalizeMultipartIdempotentTx',
]);
const readyPrimitives = new Set([
  'confirmMediaFileReady',
  'confirmProgramSubmissionMediaFileReady',
  'tryFinalizeMultipartIdempotentTx',
]);
const storageWriteBindings = new Set([
  'presignPutUrl',
  'presignUploadPartUrl',
  's3CreateMultipartUpload',
  's3CompleteMultipartUpload',
  's3PutObjectBody',
]);

function isRawStorageSpecifier(specifier) {
  return specifier.includes('/infra/s3/') || specifier.startsWith('@aws-sdk/');
}

function isStorageClientSpecifier(specifier) {
  return isRawStorageSpecifier(specifier) || /(?:^|\/)s3Client$/.test(specifier);
}

function isRoute(filename) {
  return filename.endsWith(`${path.sep}route.ts`) || filename.endsWith('/route.ts');
}

function isImplementation(filename) {
  return (
    filename === adapterPath ||
    filename.startsWith(`${repoRoot}${path.sep}`) ||
    filename.startsWith(`${infraStorageRoot}${path.sep}`)
  );
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function localBindings(importDeclaration) {
  const bindings = importDeclaration.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return [];
  return bindings.elements.map((element) => ({
    imported: element.propertyName?.text ?? element.name.text,
    local: element.name.text,
  }));
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function checkSource(filename, text) {
  const findings = [];
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const route = isRoute(filename);
  const localToImported = new Map();
  const restrictedExportLocals = new Set();
  const rawStorageExportLocals = new Set();
  const receivedTypeAliases = new Set(['ReceivedUpload']);
  const importedStatePrimitives = new Set();
  const importedReadyPrimitives = new Set();
  const importedPreparedWrites = new Set();
  const importedMultipartCompletions = new Set();
  const importedReceivedAcceptances = new Set();
  let usesFormData = false;
  let callsIntentDoor = false;
  let callsReceivedDoor = false;

  const visit = (current) => {
    if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)) {
      const specifier = current.moduleSpecifier.text;
      const bindings = current.importClause?.namedBindings;
      const rawStorage = isRawStorageSpecifier(specifier);
      const storageClient = isStorageClientSpecifier(specifier);
      if (route && specifier.startsWith('@aws-sdk/')) {
        findings.push(`${filename}: route imports raw S3 SDK ${specifier}`);
      }
      if (route && storageClient && bindings && ts.isNamespaceImport(bindings)) {
        findings.push(`${filename}: route namespace-imports storage client`);
      }
      for (const { imported, local } of localBindings(current)) {
        localToImported.set(local, imported);
        if (rawStorage || statePrimitives.has(imported)) restrictedExportLocals.add(local);
        if (rawStorage) rawStorageExportLocals.add(local);
        if (imported === 'ReceivedUpload') receivedTypeAliases.add(local);
        if (statePrimitives.has(imported)) {
          importedStatePrimitives.add(local);
          if (readyPrimitives.has(imported)) importedReadyPrimitives.add(local);
        }
        if (preparedWriteBindings.has(imported)) importedPreparedWrites.add(local);
        if (multipartCompletionBindings.has(imported)) importedMultipartCompletions.add(local);
        if (receivedAcceptanceBindings.has(imported)) importedReceivedAcceptances.add(local);
        if (route && storageClient && storageWriteBindings.has(imported)) {
          findings.push(`${filename}: route imports storage write ${local}`);
        }
      }
    }

    if (
      ts.isExportDeclaration(current) &&
      current.moduleSpecifier &&
      ts.isStringLiteral(current.moduleSpecifier)
    ) {
      if (isRawStorageSpecifier(current.moduleSpecifier.text) && filename !== storageAdapterPath) {
        findings.push(`${filename}: re-exports raw storage module ${current.moduleSpecifier.text}`);
      }
    }

    if (ts.isVariableStatement(current) && isExported(current)) {
      for (const declaration of current.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.initializer) &&
          restrictedExportLocals.has(declaration.initializer.text)
        ) {
          findings.push(`${filename}: exports an imported storage/state binding`);
        }
      }
    }

    if (ts.isFunctionDeclaration(current) && isExported(current) && !isImplementation(filename)) {
      let exportsRestrictedBinding = false;
      const inspectExportedBody = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          rawStorageExportLocals.has(node.expression.text)
        ) {
          exportsRestrictedBinding = true;
        }
        ts.forEachChild(node, inspectExportedBody);
      };
      if (current.body) inspectExportedBody(current.body);
      if (exportsRestrictedBinding) {
        findings.push(`${filename}: exports a wrapper around storage/state access`);
      }
    }

    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
      const type = current.type;
      if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
        if (receivedTypeAliases.has(type.typeName.text)) {
          findings.push(`${filename}: forges ReceivedUpload with a type assertion`);
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
      if (ts.isIdentifier(expression)) {
        const imported = localToImported.get(expression.text) ?? expression.text;
        if (intentDoorBindings.has(imported)) callsIntentDoor = true;
        if (receivedDoorBindings.has(imported)) callsReceivedDoor = true;
        if (route && readyPrimitives.has(imported) && !isImplementation(filename)) {
          findings.push(
            `${filename}: ready primitive ${expression.text} bypasses mediaUploadAdapter`,
          );
        }
      }
      if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'formData') {
        usesFormData = true;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(source);

  if (route && usesFormData && !callsIntentDoor) {
    findings.push(`${filename}: intake route lacks an executable media upload door`);
  }
  if (route && importedStatePrimitives.size > 0 && !callsIntentDoor) {
    findings.push(`${filename}: route reaches pending/ready storage state without an intent door`);
  }
  if (route && importedReadyPrimitives.size > 0 && !isImplementation(filename)) {
    findings.push(`${filename}: route imports a ready primitive outside mediaUploadAdapter`);
  }
  if (route && importedPreparedWrites.size > 0 && !callsIntentDoor) {
    findings.push(`${filename}: route writes a prepared upload without preparing an intent`);
  }
  if (route && importedMultipartCompletions.size > 0 && !callsReceivedDoor) {
    findings.push(
      `${filename}: route completes multipart upload without received-object validation`,
    );
  }
  if (route && importedReceivedAcceptances.size > 0 && !callsReceivedDoor) {
    findings.push(`${filename}: route accepts media without received-object validation`);
  }
  return findings;
}

function checkTree() {
  return walk(sourceRoot)
    .filter(
      (file) =>
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.test.tsx'),
    )
    .flatMap((file) => checkSource(file, fs.readFileSync(file, 'utf8')));
}

function selfTest() {
  const fixtures = [
    [
      'seventh formData route',
      'virtual/app/api/new/route.ts',
      'export async function POST(request) { await request.formData(); }',
    ],
    ['raw-storage re-export', 'virtual/app/api/new/route.ts', "export * from '@/infra/s3/client';"],
    [
      'renamed storage wrapper',
      'virtual/app-layer/media/wrapper.ts',
      "import { presignPutUrl } from '@/infra/s3/client'; export const issueUpload = presignPutUrl;",
    ],
    [
      'function storage wrapper',
      'virtual/app-layer/media/wrapper.ts',
      "import { presignPutUrl } from '@/infra/s3/client'; export function issueUpload() { return presignPutUrl('k', 'm'); }",
    ],
    [
      'pending primitive',
      'virtual/app/api/new/route.ts',
      "import { insertPendingMediaFileTx } from '@/app-layer/media/s3MediaStorage'; void insertPendingMediaFileTx;",
    ],
    [
      'aliased ready primitive',
      'virtual/app/api/new/route.ts',
      "import { confirmMediaFileReady as markReady } from '@/app-layer/media/s3MediaStorage'; void markReady('id', {});",
    ],
    [
      'prepared presign without intent',
      'virtual/app/api/new/route.ts',
      "import { presignPreparedUpload } from '@/app-layer/media/mediaUploadAdapter'; void presignPreparedUpload({});",
    ],
    [
      'multipart complete without receipt',
      'virtual/app/api/new/route.ts',
      "import { completePreparedMultipartUpload } from '@/app-layer/media/mediaUploadAdapter'; void completePreparedMultipartUpload('k', 'u', []);",
    ],
    [
      'forged received mark',
      'virtual/app/api/new/route.ts',
      "import { acceptReceivedMedia } from '@/app-layer/media/mediaUploadAdapter'; import type { ReceivedUpload } from '@/modules/media/uploadValidation'; const forged = {} as ReceivedUpload; void acceptReceivedMedia('id', forged);",
    ],
    [
      'acceptance without receipt',
      'virtual/app/api/new/route.ts',
      "import { acceptReceivedMedia } from '@/app-layer/media/mediaUploadAdapter'; void acceptReceivedMedia('id', {});",
    ],
    [
      'comment-only marker',
      'virtual/app/api/new/route.ts',
      'export async function POST(request) { await request.formData(); /* prepareMediaUpload() */ }',
    ],
  ];
  for (const [name, filename, source] of fixtures) {
    if (checkSource(filename, source).length === 0) {
      throw new Error(`self-test stayed green: ${name}`);
    }
  }
  console.log('media upload door self-test: OK (all structural bypass fixtures went red)');
}

if (process.argv.includes('--self-test')) selfTest();
const findings = checkTree();
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log('media upload door: OK');
}
