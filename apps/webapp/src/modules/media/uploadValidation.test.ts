import { describe, expect, it } from 'vitest';
import {
  assertReceivedUpload,
  validateReceivedUpload,
  validateUploadIntent,
  type ReceivedUpload,
} from './uploadValidation';

function jpegIntent(sizeBytes: number = 3) {
  const result = validateUploadIntent({
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes,
    policyId: 'cms',
  });
  if (!result.ok) throw new Error('fixture intent rejected');
  return result.value;
}

describe('media upload received-object door', () => {
  it('rejects a larger received object although intent declared one byte', () => {
    const result = validateReceivedUpload({
      intent: jpegIntent(1),
      contentLength: 3,
      contentType: 'image/jpeg',
      firstBytes: new Uint8Array([0xff, 0xd8, 0xff]),
    });
    expect(result).toMatchObject({ ok: false, error: 'received_size_mismatch' });
  });

  it('rejects a stored type or signature that differs from the validated intent', () => {
    expect(
      validateReceivedUpload({
        intent: jpegIntent(),
        contentLength: 3,
        contentType: 'application/pdf',
        firstBytes: new Uint8Array([0xff, 0xd8, 0xff]),
      }),
    ).toMatchObject({ ok: false, error: 'received_content_type_mismatch' });
    expect(
      validateReceivedUpload({
        intent: jpegIntent(),
        contentLength: 3,
        contentType: 'image/jpeg',
        firstBytes: new Uint8Array([0x25, 0x50, 0x44]),
      }),
    ).toMatchObject({ ok: false, error: 'file_signature_mismatch' });
  });

  it('keeps the patient submission policy image/video-only and capped', () => {
    expect(
      validateUploadIntent({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        policyId: 'patient-program-submission',
      }),
    ).toMatchObject({ ok: false, error: 'mime_not_allowed' });
    expect(
      validateUploadIntent({
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 250 * 1024 * 1024 + 1,
        policyId: 'patient-program-submission',
      }),
    ).toMatchObject({ ok: false, error: 'file_too_large' });
  });

  it('does not let a TypeScript cast mint the received-object capability', () => {
    expect(() => assertReceivedUpload({} as ReceivedUpload)).toThrow(
      'invalid_received_upload_capability',
    );

    const received = validateReceivedUpload({
      intent: jpegIntent(),
      contentLength: 3,
      contentType: 'image/jpeg',
      firstBytes: new Uint8Array([0xff, 0xd8, 0xff]),
    });
    if (!received.ok) throw new Error('valid received object rejected');

    expect(() => assertReceivedUpload(received.value)).not.toThrow();
  });
});
