import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ send: vi.fn(), transformToByteArray: vi.fn() }));

vi.mock('@/config/env', () => ({
  env: {
    S3_ENDPOINT: 'http://s3.test',
    S3_REGION: 'test',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    S3_FORCE_PATH_STYLE: true,
    S3_PRIVATE_BUCKET: 'private-bucket',
  },
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      send = fakes.send;
    },
  };
});

import { s3GetObjectPrefix } from './client';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.transformToByteArray.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));
  fakes.send.mockResolvedValue({ Body: { transformToByteArray: fakes.transformToByteArray } });
});

describe('received-object S3 prefix read', () => {
  it('uses one bounded 512-byte range instead of downloading the object', async () => {
    await expect(s3GetObjectPrefix('uploads/object')).resolves.toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );

    expect(fakes.send).toHaveBeenCalledOnce();
    expect(fakes.send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Bucket: 'private-bucket',
        Key: 'uploads/object',
        Range: 'bytes=0-511',
      },
    });
    expect(fakes.transformToByteArray).toHaveBeenCalledOnce();
  });
});
