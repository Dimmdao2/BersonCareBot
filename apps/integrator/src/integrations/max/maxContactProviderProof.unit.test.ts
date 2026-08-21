/**
 * D25 — provider proof kill-set: "MAX valid HMAC проходит, missing/invalid hash или missing token —
 * trust не дают". `fromMax` is the only place that decides whether a MAX-shared contact phone is
 * trusted (see `mapIn.ts` — `getContactPhoneFromMaxMessage`/`verifyContactHash`); everything
 * downstream (`user.phone.link`, the identity-observation door) trusts whatever `update.phone`
 * carries. This file pins that boundary directly against `fromMax`, independent of the rest of the
 * pipeline.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fromMax } from './mapIn.js';
import type { MaxUpdateValidated } from './schema.js';

const BOT_TOKEN = 'real-max-bot-token';
const PHONE_WRITTEN = '+79180000011';
const PHONE_E164 = '+79180000011';
const VCF_INFO = `BEGIN:VCARD\r\nTEL;TYPE=CELL:${PHONE_WRITTEN}\r\nEND:VCARD`;

function signVcfInfo(vcfInfo: string, token: string): string {
  return createHmac('sha256', token).update(vcfInfo).digest('hex');
}

function bodyWithContact(payload: {
  vcf_info?: string;
  hash?: string;
}): MaxUpdateValidated {
  return {
    update_type: 'message_created',
    message: {
      sender: { user_id: 207278131 },
      recipient: { chat_id: 500100 },
      body: {
        mid: 'mid-1',
        text: '',
        attachments: [{ type: 'contact', payload }],
      },
    },
  } as unknown as MaxUpdateValidated;
}

function receivedPhone(update: ReturnType<typeof fromMax>): string | undefined {
  return update && update.kind === 'message' ? update.phone : undefined;
}

describe('MAX contact provider proof (D25 kill-set)', () => {
  it('valid HMAC hash against the configured bot token → phone is trusted', () => {
    const body = bodyWithContact({ vcf_info: VCF_INFO, hash: signVcfInfo(VCF_INFO, BOT_TOKEN) });
    expect(receivedPhone(fromMax(body, BOT_TOKEN))).toBe(PHONE_E164);
  });

  it('missing hash on the contact payload → phone is NOT trusted (absent), not a silent accept', () => {
    const body = bodyWithContact({ vcf_info: VCF_INFO });
    expect(receivedPhone(fromMax(body, BOT_TOKEN))).toBeUndefined();
  });

  it('hash present but mismatched (spoofed contact) → phone is NOT trusted', () => {
    const body = bodyWithContact({
      vcf_info: VCF_INFO,
      hash: signVcfInfo(VCF_INFO, 'a-different-token'),
    });
    expect(receivedPhone(fromMax(body, BOT_TOKEN))).toBeUndefined();
  });

  it('bot token not configured on this deployment → phone is NOT trusted even with a hash present', () => {
    const body = bodyWithContact({ vcf_info: VCF_INFO, hash: signVcfInfo(VCF_INFO, BOT_TOKEN) });
    expect(receivedPhone(fromMax(body, ''))).toBeUndefined();
    expect(receivedPhone(fromMax(body, undefined))).toBeUndefined();
  });
});
