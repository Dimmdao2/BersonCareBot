import { describe, expect, it } from 'vitest';
import { encoderOutputFor } from '@/shared/lib/mediaEncoderOutput';
import { ALLOWED_MEDIA_MIME } from '@/modules/media/uploadAllowedMime';

describe('encoderOutputFor', () => {
  it('называет свой вывод только там, где он действительно бывает', () => {
    expect(encoderOutputFor('image/heic')).toBe('standard_image');
    expect(encoderOutputFor('IMAGE/PNG')).toBe('standard_image');
    expect(encoderOutputFor('video/quicktime')).toBe('hls_video');
    expect(encoderOutputFor('application/pdf')).toBe('none');
    expect(encoderOutputFor('audio/mpeg')).toBe('none');
    expect(encoderOutputFor('text/csv')).toBe('none');
  });

  it('неизвестный или пустой тип — «нашей версии нет», а не картинка', () => {
    expect(encoderOutputFor(null)).toBe('none');
    expect(encoderOutputFor('')).toBe('none');
    expect(encoderOutputFor('application/octet-stream')).toBe('none');
  });

  /*
   * Смысл этапа М7 держится на том, что типов с нашей версией ровно два. Если в приём добавят
   * третий (скажем, документ, который мы начнём превращать в картинку), правило обязано узнать об
   * этом здесь, а не молча оставить новый тип в выдаче как есть.
   */
  it('среди принимаемых типов наш энкодер работает ровно с картинками и видео', () => {
    const withOutput = [...ALLOWED_MEDIA_MIME].filter((m) => encoderOutputFor(m) !== 'none');
    expect(withOutput.every((m) => m.startsWith('image/') || m.startsWith('video/'))).toBe(true);
    expect(withOutput.length).toBe(
      [...ALLOWED_MEDIA_MIME].filter((m) => m.startsWith('image/') || m.startsWith('video/')).length,
    );
  });
});
