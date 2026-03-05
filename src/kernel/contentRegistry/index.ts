import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const scriptStepSchema = z.object({
  action: z.string().min(1),
  mode: z.enum(['sync', 'async']).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const contentScriptSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1).optional(),
  event: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  match: z.record(z.string(), z.unknown()).optional(),
  conditions: z.array(z.unknown()).optional(),
  steps: z.array(scriptStepSchema),
});

const scriptsFileSchema = z.array(contentScriptSchema);
const templatesFileSchema = z.record(z.string(), z.unknown());

export type ContentScript = z.infer<typeof contentScriptSchema>;
export type TemplateMap = z.infer<typeof templatesFileSchema>;

export type ContentBundle = {
  scripts: ContentScript[];
  templates: TemplateMap;
};

export type ContentRegistry = Record<string, ContentBundle>;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const st = await stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Loads content bundles from src/content/* folders.
 * Each source folder may define scripts.json and templates.json.
 */
export async function loadContentRegistry(input?: { rootDir?: string }): Promise<ContentRegistry> {
  const rootDir = input?.rootDir ?? path.resolve(process.cwd(), 'src/content');
  const entries = await readdir(rootDir, { withFileTypes: true });
  const registry: ContentRegistry = {};

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = entry.name;
    const sourceDir = path.join(rootDir, source);
    const scriptsPath = path.join(sourceDir, 'scripts.json');
    const templatesPath = path.join(sourceDir, 'templates.json');

    const scripts = await fileExists(scriptsPath)
      ? scriptsFileSchema.parse(await readJsonFile(scriptsPath))
      : [];
    const templates = await fileExists(templatesPath)
      ? templatesFileSchema.parse(await readJsonFile(templatesPath))
      : {};

    registry[source] = { scripts, templates };
  }

  return registry;
}

/** Returns one source content bundle from preloaded registry. */
export function getContentBundle(
  registry: ContentRegistry,
  source: string,
): ContentBundle | null {
  return registry[source] ?? null;
}
