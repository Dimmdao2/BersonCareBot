import type {
  ContentBundleView,
  ContentPort,
  ContentScript,
  ContentSelectionScope,
  ContentTemplate,
} from '../../kernel/contracts/index.js';
import type {
  ContentRegistry,
  ContentScript as RegistryScript,
} from '../../kernel/contentRegistry/index.js';
import {
  getContentBundle,
  getEffectiveBundleKey,
  loadContentRegistry,
} from '../../kernel/contentRegistry/index.js';

type RegistryState = {
  load: () => Promise<ContentRegistry>;
};

function createRegistryState(input?: { rootDir?: string }): RegistryState {
  let registryPromise: Promise<ContentRegistry> | null = null;
  return {
    load: () => {
      if (!registryPromise) {
        registryPromise = input?.rootDir
          ? loadContentRegistry({ rootDir: input.rootDir })
          : loadContentRegistry();
      }
      return registryPromise;
    },
  };
}

function normalizeScript(script: RegistryScript): ContentScript {
  const normalized: ContentScript = {
    id: script.id,
    steps: script.steps.map((step) => ({
      action: step.action,
      ...(step.mode ? { mode: step.mode } : {}),
      ...(step.params ? { params: step.params } : {}),
    })),
  };
  if (script.source) normalized.source = script.source;
  if (script.event) normalized.event = script.event;
  if (typeof script.enabled === 'boolean') normalized.enabled = script.enabled;
  if (typeof script.priority === 'number') normalized.priority = script.priority;
  if (script.match) normalized.match = script.match;
  if (script.conditions) normalized.conditions = script.conditions;
  return normalized;
}

function listScripts(bundle: { scripts: RegistryScript[] }): ContentScript[] {
  return bundle.scripts.map((script) => normalizeScript(script));
}

function findTemplate(bundle: { templates: Record<string, unknown> }, templateId: string): ContentTemplate | null {
  const raw = bundle.templates[templateId];
  if (typeof raw === 'string') return { id: templateId, text: raw };
  return null;
}

export function createContentPort(input?: { rootDir?: string }): ContentPort {
  const registry = createRegistryState(input);

  const port: ContentPort = {
    async getScripts(scope: ContentSelectionScope): Promise<ContentScript[]> {
      const data = await registry.load();
      const key = getEffectiveBundleKey(data, scope.source, scope.audience);
      const bundle = getContentBundle(data, key);
      if (!bundle) return [];
      return listScripts(bundle);
    },
    async getBundle(scope: ContentSelectionScope): Promise<ContentBundleView | null> {
      const data = await registry.load();
      const key = getEffectiveBundleKey(data, scope.source, scope.audience);
      const bundle = getContentBundle(data, key);
      if (!bundle) return null;
      return {
        scripts: listScripts(bundle),
        templates: bundle.templates,
        ...(bundle.menus ? { menus: bundle.menus } : {}),
        ...(bundle.mainReplyKeyboard ? { mainReplyKeyboard: bundle.mainReplyKeyboard } : {}),
      };
    },
    async getTemplate(scope: ContentSelectionScope, templateId: string): Promise<ContentTemplate | null> {
      const data = await registry.load();
      const key = getEffectiveBundleKey(data, scope.source, scope.audience);
      const bundle = getContentBundle(data, key);
      if (!bundle) return null;
      return findTemplate(bundle, templateId);
    },
    async getTemplateByKey(key: string): Promise<ContentTemplate | null> {
      const [source, templateId] = key.split(':');
      if (!source || !templateId) return null;
      const data = await registry.load();
      for (const bundleKey of [source, `${source}/user`, `${source}/admin`]) {
        const bundle = getContentBundle(data, bundleKey);
        if (bundle) {
          const t = findTemplate(bundle, templateId);
          if (t) return t;
        }
      }
      return null;
    },
  };

  return port;
}
