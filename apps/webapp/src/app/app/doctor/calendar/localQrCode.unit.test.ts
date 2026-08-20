import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { localQrCodeDataUri } from './localQrCode';

function matrixHash(dataUri: string) {
  const svg = decodeURIComponent(dataUri.slice(dataUri.indexOf(',') + 1));
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBox) throw new Error('QR SVG has no square viewBox');
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  if (width !== height) throw new Error('QR SVG viewBox is not square');

  const symbolSize = width - 8;
  const darkModules = new Set(
    [...svg.matchAll(/<path d="M(\d+) (\d+)h1v1h-1z"\/>/g)].map(
      (match) => `${Number(match[1]) - 4},${Number(match[2]) - 4}`,
    ),
  );
  const rows = Array.from({ length: symbolSize }, (_, y) =>
    Array.from({ length: symbolSize }, (_, x) => (darkModules.has(`${x},${y}`) ? '1' : '0')).join(
      '',
    ),
  );
  return createHash('sha256')
    .update(`${rows.join('\n')}\n`)
    .digest('hex');
}

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

  it.each([
    {
      label: 'short payment URL',
      url: 'https://pay.example.test/appointment-1?token=20',
      matrixSha256: 'f090959e38a652922347659368813ec5fbeb1d0c1b6641c42ea3759385d35869',
    },
    {
      label: 'UTF-8 payment URL',
      url: 'https://pay.example.test/оплата?пациент=Иван&token=413',
      matrixSha256: 'bad5099aaf791bfbf657c1ee3ac4d898f52810e2bd4a37d4b63292aa4d299f89',
    },
    {
      label: 'long YooKassa-shaped confirmation URL',
      url:
        'https://yoomoney.ru/checkout/payments/v2/contract?orderId=75a1a817-7a09-4c68-bb23-c88e5c26f39f&returnUrl=https%3A%2F%2Fbersoncare.ru%2Fapp%2Fpatient%2Fpayments%2Fcomplete&confirmationToken=' +
        `${'A'.repeat(48)}0`,
      matrixSha256: '2df4054f6470743d895d06bc7ea35185c2ff72dc78e2ca4ccd4f744aedba393e',
    },
    {
      label: '271-byte version-10 capacity boundary',
      url:
        'https://yoomoney.ru/checkout/payments/v2/contract?orderId=' +
        'a'.repeat(271 - 'https://yoomoney.ru/checkout/payments/v2/contract?orderId='.length),
      matrixSha256: '6b88fb0f2b5151338afff03daaefaa1bf04f6e6e52d2abbb7b434206054499cd',
    },
  ])('matches the independent QR Model 2 reference for a $label', ({ url, matrixSha256 }) => {
    // Fixed qrencode 4.1.1/L/byte-mode oracles, normalized independently to the product's declared mask 0.
    // The short and UTF-8 vectors were emitted directly with mask 0; version-10 vectors were
    // re-masked over an independently-written standard function map, received fresh BCH format bits,
    // and round-tripped exactly to qrencode's original matrix; see the audit artifact for the transcript.
    expect(matrixHash(localQrCodeDataUri(url))).toBe(matrixSha256);
  });
});
