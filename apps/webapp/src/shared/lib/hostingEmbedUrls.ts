/**
 * Ссылка на внешний видеохостинг: разбор, канонизация и безопасный iframe-src.
 *
 * Владелец 2026-08-19: «в упражнение нужно вставить ссылку на YouTube / RuTube / VK Видео /
 * Vimeo — открывается в iframe» (`docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/OWNER_DECISIONS.md` п. 11,
 * исполнение — `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` UI-EX-HOST).
 *
 * Здесь две разные величины, и их нельзя путать:
 *   * **канонический URL** (`canonicalUrl`) — то, что ложится в базу (`lfk_exercise_media.media_url`,
 *     `content_pages.video_url`). Это публичная «смотрелка» хоста без трекинга, плейлистов и
 *     тайм-кодов. Именно её классифицирует аналитика
 *     (`modules/platform-analytics/hostingUrlKind.ts`), поэтому embed-домены в базу не пишем:
 *     `youtube-nocookie.com` классификатору неизвестен и был бы посчитан как файл;
 *   * **embed-src** (`embedSrc`) — то, что уходит в `<iframe src>`, и вычисляется при рендере.
 *
 * Наименее навязчивый вариант вложения у каждого хоста выбран здесь один раз:
 * YouTube — `youtube-nocookie.com`, Vimeo — `dnt=1`, RuTube и VK таких режимов не имеют.
 * Открытый вопрос владельцу (немедленный iframe против клика «смотреть») — в план-файле
 * `docs/_TODO/EXTERNAL_VIDEO_LINK_2026-08-19.md`.
 */

export type HostedVideoProvider = 'youtube' | 'rutube' | 'vk' | 'vimeo';

export type HostedVideoLink = {
  provider: HostedVideoProvider;
  /** Публичный URL хоста без трекинга — то, что сохраняется в базу. */
  canonicalUrl: string;
  /** Значение для `<iframe src>`; наименее навязчивый режим хоста. */
  embedSrc: string;
};

export const HOSTED_VIDEO_PROVIDER_LABEL_RU: Record<HostedVideoProvider, string> = {
  youtube: 'YouTube',
  rutube: 'RuTube',
  vk: 'VK Видео',
  vimeo: 'Vimeo',
};

/** Список разрешённых хостов одной строкой — для сообщений об отказе и подсказок формы. */
export const HOSTED_VIDEO_ALLOWED_HOSTS_RU = 'YouTube, RuTube, VK Видео и Vimeo';

function normalizedHost(u: URL): string {
  return u.hostname.replace(/^www\./, '').toLowerCase();
}

function parseYoutube(u: URL): HostedVideoLink | null {
  const host = normalizedHost(u);
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = u.pathname.replace(/^\//, '').split('/')[0] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
  }

  /* Идентификатор YouTube — 11 символов base64url; всё остальное роликом не является. */
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    provider: 'youtube',
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    embedSrc: `https://www.youtube-nocookie.com/embed/${id}`,
  };
}

function parseRutube(u: URL): HostedVideoLink | null {
  if (normalizedHost(u) !== 'rutube.ru') return null;
  const m = /^\/(?:video\/private|video|shorts|play\/embed)\/([^/?#]+)/.exec(u.pathname);
  const id = m?.[1];
  if (!id || !/^[a-f0-9]{32}$/i.test(id)) return null;

  /* `p` — токен доступа к приватному ролику; без него приватное видео не откроется. Всё
     остальное в query (utm, `t`, плейлист) отбрасывается. */
  const access = u.searchParams.get('p');
  const query = access ? `?p=${encodeURIComponent(access)}` : '';
  return {
    provider: 'rutube',
    canonicalUrl: `https://rutube.ru/video/${id.toLowerCase()}/${query}`,
    embedSrc: `https://rutube.ru/play/embed/${id.toLowerCase()}${query}`,
  };
}

function parseVk(u: URL): HostedVideoLink | null {
  const host = normalizedHost(u);
  if (host !== 'vk.com' && host !== 'vkvideo.ru' && host !== 'vk.ru' && host !== 'm.vk.com') {
    return null;
  }

  let oid: string | null = null;
  let vid: string | null = null;

  if (u.pathname === '/video_ext.php') {
    oid = u.searchParams.get('oid');
    vid = u.searchParams.get('id');
  } else {
    /* `/video-12345_67890`, `/video12345_67890`, а также `/clip-12345_67890`. */
    const m = /^\/(?:video|clip)(-?\d+)_(\d+)/.exec(u.pathname);
    oid = m?.[1] ?? null;
    vid = m?.[2] ?? null;
  }

  if (!oid || !vid || !/^-?\d+$/.test(oid) || !/^\d+$/.test(vid)) return null;

  /* `hash` — ключ доступа к ролику с ограниченной видимостью; без него он не проигрывается. */
  const hash = u.searchParams.get('hash');
  const hashOk = hash && /^[a-f0-9]{8,32}$/i.test(hash) ? hash : null;
  const embed = new URL('https://vkvideo.ru/video_ext.php');
  embed.searchParams.set('oid', oid);
  embed.searchParams.set('id', vid);
  if (hashOk) embed.searchParams.set('hash', hashOk);

  return {
    provider: 'vk',
    canonicalUrl: `https://vkvideo.ru/video${oid}_${vid}${hashOk ? `?hash=${hashOk}` : ''}`,
    embedSrc: embed.toString(),
  };
}

function parseVimeo(u: URL): HostedVideoLink | null {
  const host = normalizedHost(u);
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;

  const m =
    host === 'player.vimeo.com'
      ? /^\/video\/(\d+)(?:\/([A-Za-z0-9]+))?/.exec(u.pathname)
      : /^\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)(?:\/([A-Za-z0-9]+))?/.exec(
          u.pathname,
        );
  const id = m?.[1];
  if (!id) return null;

  /* Второй сегмент — приватный хеш нелистингового ролика (`vimeo.com/123/abcdef`); в embed он
     передаётся как `h`. Может приехать и как `?h=`. */
  const hash = m?.[2] ?? u.searchParams.get('h');
  const hashOk = hash && /^[A-Za-z0-9]{4,32}$/.test(hash) ? hash : null;

  const embed = new URL(`https://player.vimeo.com/video/${id}`);
  if (hashOk) embed.searchParams.set('h', hashOk);
  /* `dnt=1` — режим Vimeo «не отслеживать»: плеер не ставит куки и не шлёт аналитику. */
  embed.searchParams.set('dnt', '1');

  return {
    provider: 'vimeo',
    canonicalUrl: `https://vimeo.com/${id}${hashOk ? `/${hashOk}` : ''}`,
    embedSrc: embed.toString(),
  };
}

/**
 * Единственная дверь разбора. `null` означает «это не ссылка одного из четырёх разрешённых
 * хостов либо в ней нет идентификатора ролика» — вызывающий обязан отказать, а не сохранить.
 */
export function parseHostedVideoLink(raw: string): HostedVideoLink | null {
  const value = raw.trim();
  if (!value) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return parseYoutube(u) ?? parseRutube(u) ?? parseVk(u) ?? parseVimeo(u);
}

/** Текст отказа: называет, что именно разрешено. `null` — ссылка принята. */
export function hostedVideoLinkRejectionRu(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Вставьте ссылку на видео.';
  if (parseHostedVideoLink(value)) return null;
  return `Ссылку можно вставить только на ${HOSTED_VIDEO_ALLOWED_HOSTS_RU}, и она должна вести на конкретный ролик.`;
}

/** `<iframe src>` для сохранённой ссылки. `null` — показывать iframe нельзя. */
export function toHostedVideoEmbedSrc(url: string): string | null {
  return parseHostedVideoLink(url)?.embedSrc ?? null;
}

const HOSTED_EMBED_ORIGINS = new Set([
  'https://www.youtube-nocookie.com',
  'https://rutube.ru',
  'https://vkvideo.ru',
  'https://player.vimeo.com',
]);

/**
 * Последняя проверка перед подстановкой в `src`: origin принадлежит нашему allowlist.
 * Держится рядом с генератором, чтобы разрешённых источников не стало два списка.
 */
export function isHostedVideoEmbedSrc(embedSrc: string): boolean {
  try {
    return HOSTED_EMBED_ORIGINS.has(new URL(embedSrc).origin);
  } catch {
    return false;
  }
}
