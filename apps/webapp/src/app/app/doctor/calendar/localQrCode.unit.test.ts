import { describe, expect, it } from 'vitest';
import { localQrCodeDataUri } from './localQrCode';

describe('localQrCodeDataUri', () => {
  it('encodes the exact payment URL locally without exposing it in an external request', () => {
    const firstUrl = 'https://pay.example.test/appointment-1?token=one';
    const secondUrl = 'https://pay.example.test/appointment-1?token=two';
    const firstQr = localQrCodeDataUri(firstUrl);

    expect(firstQr).toMatch(/^data:image\/svg\+xml,/);
    expect(firstQr).not.toContain(firstUrl);
    expect(firstQr).not.toMatch(/^https?:/);
    expect(localQrCodeDataUri(firstUrl)).toBe(firstQr);
    expect(localQrCodeDataUri(secondUrl)).not.toBe(firstQr);
  });
});
