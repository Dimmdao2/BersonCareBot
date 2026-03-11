import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ContentScriptMatchObject, ContentScriptMatchValue } from '../contracts/orchestrator.js';

const scriptStepSchema = z.object({
  action: z.string().min(1),
  mode: z.enum(['sync', 'async']).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const contentScriptMatchValueSchema: z.ZodType<ContentScriptMatchValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(contentScriptMatchValueSchema),
  contentScriptMatchObjectSchema,
]));

const contentScriptMatchObjectSchema: z.ZodType<ContentScriptMatchObject> = z.lazy(() => z.object({
  textPresent: z.boolean().optional(),
  phonePresent: z.boolean().optional(),
  excludeActions: z.array(z.string().min(1)).optional(),
  excludeTexts: z.array(z.string().min(1)).optional(),
}).catchall(contentScriptMatchValueSchema));

const contentScriptSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1).optional(),
  event: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  match: contentScriptMatchObjectSchema.optional(),
  conditions: z.array(z.unknown()).optional(),
  steps: z.array(scriptStepSchema),
});

const scriptsFileSchema = z.array(contentScriptSchema);
const templatesFileSchema = z.record(z.string(), z.unknown());

export type ContentScript = z.infer<typeof contentScriptSchema>;
export type TemplateMap = z.infer<typeof templatesFileSchema>;

/** Menu id -> inline keyboard (array of rows, each row array of button objects). */
export type MenuMap = Record<string, unknown>;

export type ContentBundle = {
  scripts: ContentScript[];
  templates: TemplateMap;
  /** Optional menus for param expansion (e.g. params.menu = "main" → inlineKeyboard from menus.main). */
  menus?: MenuMap;
};

export type ContentRegistry = Record<string, ContentBundle>;

/** Audience for content selection. Must match ContentAudience in contracts. */
export type ContentAudience = 'user' | 'admin';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const st = await stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function dirExists(filePath: string): Promise<boolean> {
  try {
    const st = await stat(filePath);
    return st.isDirectory();
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
 * - If source has user/ and admin/ subdirs (each with scripts.json), registers "source/user" and "source/admin".
 * - Otherwise loads source/scripts.json and source/templates.json as single bundle under "source".
 */
export async function loadContentRegistry(input?: { rootDir?: string }): Promise<ContentRegistry> {
  const rootDir = input?.rootDir ?? path.resolve(process.cwd(), 'src/content');
  const entries = await readdir(rootDir, { withFileTypes: true });
  const registry: ContentRegistry = {};

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = entry.name;
    const sourceDir = path.join(rootDir, source);

    const hasUserDir = await dirExists(path.join(sourceDir, 'user'));
    const hasAdminDir = await dirExists(path.join(sourceDir, 'admin'));

    if (hasUserDir && hasAdminDir) {
      for (const audience of ['user', 'admin'] as ContentAudience[]) {
        const audienceDir = path.join(sourceDir, audience);
        const scriptsPath = path.join(audienceDir, 'scripts.json');
        const templatesPath = path.join(audienceDir, 'templates.json');
        const menuPath = path.join(audienceDir, 'menu.json');
        const scriptsRaw = await fileExists(scriptsPath) ? await readJsonFile(scriptsPath) : [];
        const templatesRaw = await fileExists(templatesPath) ? await readJsonFile(templatesPath) : {};
        const menusRaw = await fileExists(menuPath) ? await readJsonFile(menuPath) : undefined;
        const scripts = scriptsFileSchema.parse(Array.isArray(scriptsRaw) ? scriptsRaw : []);
        const templates = templatesFileSchema.parse(typeof templatesRaw === 'object' && templatesRaw !== null ? templatesRaw : {});
        const menus = typeof menusRaw === 'object' && menusRaw !== null && !Array.isArray(menusRaw) ? (menusRaw as MenuMap) : undefined;
        const key = `${source}/${audience}`;
        ensureNoDuplicateScriptIds({ scripts, templates }, key);
        registry[key] = menus ? { scripts, templates, menus } : { scripts, templates };
      }
      continue;
    }

    const scriptsPath = path.join(sourceDir, 'scripts.json');
    const templatesPath = path.join(sourceDir, 'templates.json');
    const scripts = await fileExists(scriptsPath)
      ? scriptsFileSchema.parse(await readJsonFile(scriptsPath))
      : [];
    const templates = await fileExists(templatesPath)
      ? templatesFileSchema.parse(await readJsonFile(templatesPath))
      : {};
    ensureNoDuplicateScriptIds({ scripts, templates }, source);
    registry[source] = { scripts, templates };
  }

  return registry;
}

/**
 * Throws if the same script id appears twice in the bundle (deterministic conflict detection).
 */
export function ensureNoDuplicateScriptIds(bundle: ContentBundle, scopeKey: string): void {
  const seen = new Set<string>();
  for (const script of bundle.scripts) {
    if (seen.has(script.id)) {
      throw new Error(`Content scope "${scopeKey}": duplicate script id "${script.id}"`);
    }
    seen.add(script.id);
  }
}

/** Returns one content bundle by exact key (e.g. "telegram" or "telegram/user"). */
export function getContentBundle(
  registry: ContentRegistry,
  key: string,
): ContentBundle | null {
  return registry[key] ?? null;
}

/**
 * Resolves registry key for scope. Use scope-based key when present, else source-only.
 * Deterministic: no business logic, only lookup.
 */
export function getEffectiveBundleKey(
  registry: ContentRegistry,
  source: string,
  audience: ContentAudience,
): string {
  const scopeKey = `${source}/${audience}`;
  if (registry[scopeKey]) return scopeKey;
  return source;
}
