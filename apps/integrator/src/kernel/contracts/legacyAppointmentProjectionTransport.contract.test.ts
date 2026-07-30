import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const LEGACY_APPOINTMENT_EVENT = 'appointment.record.upserted';
const INTEGRATOR_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNTIME_SURFACES = [
  path.join(INTEGRATOR_ROOT, 'src'),
  path.join(INTEGRATOR_ROOT, '../webapp/src/modules/integrator'),
  path.join(INTEGRATOR_ROOT, '../webapp/src/app/api/integrator/events'),
];

type LegacyEventOccurrence = {
  file: string;
  line: number;
  column: number;
};

async function listRuntimeTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listRuntimeTypeScriptFiles(entryPath);
      if (
        !entry.isFile() ||
        !/\.[cm]?tsx?$/.test(entry.name) ||
        /\.test\.[cm]?tsx?$/.test(entry.name)
      ) {
        return [];
      }
      return [entryPath];
    }),
  );
  return nested.flat();
}

function findLegacyEventOccurrences(file: string, sourceText: string): LegacyEventOccurrence[] {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const occurrences: LegacyEventOccurrence[] = [];

  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) && node.text === LEGACY_APPOINTMENT_EVENT) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      occurrences.push({
        file: path.relative(INTEGRATOR_ROOT, file),
        line: position.line + 1,
        column: position.character + 1,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return occurrences;
}

describe('legacy appointment projection transport retirement', () => {
  it('keeps the retired appointment projection event out of runtime producer and ingress code', async () => {
    const files = (await Promise.all(RUNTIME_SURFACES.map(listRuntimeTypeScriptFiles))).flat();
    const occurrences = (
      await Promise.all(
        files.map(async (file) => findLegacyEventOccurrences(file, await readFile(file, 'utf8'))),
      )
    ).flat();

    expect(occurrences).toEqual([]);
  });
});
