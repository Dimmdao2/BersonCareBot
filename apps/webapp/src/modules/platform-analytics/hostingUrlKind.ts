/**
 * Классификация URL видео упражнения/CMS для аналитики (не плеер).
 * Полный iframe-allowlist VK/Vimeo — задача кабинета врача UI-EX-HOST.
 */
export type HostingKind = 'file' | 'youtube' | 'rutube' | 'vk' | 'vimeo' | 'other';

export function classifyMediaUrlKind(url: string): HostingKind {
  const value = url.trim();
  if (!value) return 'other';
  if (/^\/api\/media\/[0-9a-f-]{36}$/i.test(value)) return 'file';
  let host = '';
  try {
    host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'other';
  }
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
  if (host === 'rutube.ru') return 'rutube';
  if (host === 'vk.com' || host === 'vkvideo.ru' || host === 'vk.ru') return 'vk';
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return 'vimeo';
  if (/^https?:\/\//i.test(value)) return 'file';
  return 'other';
}

export function isHostingIframeKind(kind: HostingKind): boolean {
  return kind === 'youtube' || kind === 'rutube' || kind === 'vk' || kind === 'vimeo';
}
