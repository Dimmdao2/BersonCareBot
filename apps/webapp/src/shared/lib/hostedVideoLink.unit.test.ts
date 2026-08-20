import { describe, expect, it } from 'vitest';
import {
  HOSTED_VIDEO_ALLOWED_HOSTS_RU,
  hostedVideoLinkRejectionRu,
  isHostedVideoEmbedSrc,
  parseHostedVideoLink,
  toHostedVideoEmbedSrc,
} from '@/shared/lib/hostingEmbedUrls';

/**
 * Решение владельца 19.08: ссылка на YouTube / RuTube / VK Видео / Vimeo вместо загруженного
 * файла (`OWNER_DECISIONS.md` п. 10–11). Проверяется поведение, ради которого дверь и написана:
 * ссылка из адресной строки принимается и очищается, ссылка на посторонний хост — нет, а в
 * `<iframe src>` попадает только наименее навязчивый вариант хоста.
 */
describe('вставленная ссылка на видеохостинг', () => {
  it('принимает ссылку YouTube из адресной строки и выбрасывает плейлист, тайм-код и utm', () => {
    const link = parseHostedVideoLink(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345&t=42s&utm_source=vk',
    );
    expect(link?.provider).toBe('youtube');
    expect(link?.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('принимает короткую ссылку youtu.be и ссылку shorts как тот же ролик', () => {
    expect(parseHostedVideoLink('https://youtu.be/dQw4w9WgXcQ?si=abc')?.canonicalUrl).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(
      parseHostedVideoLink('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.canonicalUrl,
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('принимает RuTube и сохраняет ключ доступа к приватному ролику', () => {
    const id = 'a'.repeat(32);
    const link = parseHostedVideoLink(`https://rutube.ru/video/${id}/?p=SeCrEt&utm_medium=mail`);
    expect(link?.provider).toBe('rutube');
    expect(link?.canonicalUrl).toBe(`https://rutube.ru/video/${id}/?p=SeCrEt`);
    expect(link?.embedSrc).toBe(`https://rutube.ru/play/embed/${id}?p=SeCrEt`);
  });

  it('принимает VK Видео в обеих формах и приводит их к одному ролику', () => {
    const fromPage = parseHostedVideoLink('https://vk.com/video-12345_67890');
    const fromEmbed = parseHostedVideoLink(
      'https://vkvideo.ru/video_ext.php?oid=-12345&id=67890&hd=2',
    );
    expect(fromPage?.provider).toBe('vk');
    expect(fromPage?.canonicalUrl).toBe('https://vkvideo.ru/video-12345_67890');
    expect(fromEmbed?.canonicalUrl).toBe(fromPage?.canonicalUrl);
  });

  it('принимает Vimeo и сохраняет хеш нелистингового ролика', () => {
    const link = parseHostedVideoLink('https://vimeo.com/76979871/abc123');
    expect(link?.provider).toBe('vimeo');
    expect(link?.canonicalUrl).toBe('https://vimeo.com/76979871/abc123');
    expect(link?.embedSrc).toContain('https://player.vimeo.com/video/76979871');
    expect(link?.embedSrc).toContain('h=abc123');
  });

  it('отказывает постороннему хосту и называет, что разрешено', () => {
    const reason = hostedVideoLinkRejectionRu('https://example.com/video/1');
    expect(reason).toContain(HOSTED_VIDEO_ALLOWED_HOSTS_RU);
    expect(parseHostedVideoLink('https://example.com/video/1')).toBeNull();
  });

  it.each([
    ['ссылка на сам хост без ролика', 'https://www.youtube.com/'],
    ['канал вместо ролика', 'https://www.youtube.com/@somechannel'],
    ['поддельный поддомен', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['не-URL', 'посмотри вот это видео'],
    ['javascript', 'javascript:alert(1)'],
  ])('отказывает: %s', (_case, value) => {
    expect(parseHostedVideoLink(value)).toBeNull();
    expect(hostedVideoLinkRejectionRu(value)).not.toBeNull();
  });
});

describe('вложение чужого плеера', () => {
  it('YouTube отдаётся в варианте без куки', () => {
    const src = toHostedVideoEmbedSrc('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('Vimeo отдаётся в режиме «не отслеживать»', () => {
    expect(toHostedVideoEmbedSrc('https://vimeo.com/76979871')).toContain('dnt=1');
  });

  it('признаёт только четыре разрешённых источника вложения', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      `https://rutube.ru/video/${'b'.repeat(32)}/`,
      'https://vkvideo.ru/video-1_2',
      'https://vimeo.com/76979871',
    ]) {
      const src = toHostedVideoEmbedSrc(url);
      expect(src).not.toBeNull();
      expect(isHostedVideoEmbedSrc(src as string)).toBe(true);
    }
    expect(isHostedVideoEmbedSrc('https://evil.example/embed/1')).toBe(false);
    /* Обычный `youtube.com` — не наш вариант вложения: он ставит куки до нажатия «play». */
    expect(isHostedVideoEmbedSrc('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(false);
  });
});
