import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILD_ID_META_NAME } from '@/shared/lib/reloadConstants';

vi.mock('@/shared/lib/platformCookie.server', () => ({
  getPlatformEntry: vi.fn(async () => 'standalone'),
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: vi.fn(async () => ({ surface: 'patient', publicOrigin: 'https://test.local' })),
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));

type Renderable = { props?: { children?: unknown; name?: unknown; content?: unknown } } | unknown;

/** Находит в дереве элементов мета-тег с заданным именем и отдаёт его `content`. */
function findMetaContent(node: Renderable, metaName: string): string | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findMetaContent(child, metaName);
      if (found !== null) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return null;
  if (props.name === metaName && typeof props.content === 'string') return props.content;
  return findMetaContent(props.children, metaName);
}

describe('идентификатор сборки в разметке страницы', () => {
  const originalCwd = process.cwd();
  const privateGitSha = '74c4986';
  const privateBuildEpoch = '1789553400';
  let buildRoot: string;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('BUILD_ID', `${privateGitSha}-${privateBuildEpoch}`);
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', `${privateGitSha}-${privateBuildEpoch}`);
    vi.stubEnv('SESSION_COOKIE_SECRET', 'layout-test-session-secret-min-16');
    buildRoot = mkdtempSync(join(tmpdir(), 'bcb-version-layout-'));
    mkdirSync(join(buildRoot, '.next'));
    writeFileSync(join(buildRoot, '.next', 'BUILD_ID'), 'opaque-next-build-a\n', 'utf8');
    process.chdir(buildRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(buildRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  /**
   * Мета-тег читает КАЖДЫЙ анонимный посетитель любой страницы — дверь шире, чем `/api/version`.
   * Поэтому приватный идентификатор выкладки (коммит и время сборки) сюда попадать не должен.
   */
  it('не выносит наружу приватный идентификатор выкладки', async () => {
    const { default: RootLayout } = await import('./layout');
    const tree = await RootLayout({ children: null });
    const shown = findMetaContent(tree, BUILD_ID_META_NAME);

    expect(shown).toEqual(expect.any(String));
    expect(shown).not.toBe('');
    expect(shown).not.toContain(privateGitSha);
    expect(shown).not.toContain(privateBuildEpoch);
  });

  /**
   * Сторож вкладки сверяет мета-тег с ответом `/api/version`: разошлись — страница перезагружается.
   * Значит две двери обязаны отвечать одинаково, иначе открытая вкладка уходит в вечный reload.
   */
  it('отвечает то же, что и дверь версии', async () => {
    const { default: RootLayout } = await import('./layout');
    const shown = findMetaContent(await RootLayout({ children: null }), BUILD_ID_META_NAME);

    const { GET } = await import('./api/version/route');
    const answered = (await (await GET(new Request('http://test.local/api/version'))).json()) as {
      buildId?: string;
    };

    expect(answered.buildId).toBe(shown);
  });
});
