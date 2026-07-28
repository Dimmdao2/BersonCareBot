import { describe, expect, it, vi } from 'vitest';
import type { MediaStoragePort } from './ports';
import { createMediaService } from './service';
import { mockMediaStoragePort } from '@/infra/repos/mockMediaStorage';

describe('media service', () => {
  it('upload returns record and url', async () => {
    const service = createMediaService(mockMediaStoragePort);
    const buf = new ArrayBuffer(4);
    const result = await service.upload({
      body: buf,
      filename: 'test.jpg',
      mimeType: 'image/jpeg',
    });
    expect(result.record).toMatchObject({
      kind: 'image',
      mimeType: 'image/jpeg',
      filename: 'test.jpg',
      size: 4,
    });
    expect(result.record.id).toMatch(/^media-\d+$/);
    expect(result.url).toBe(`/api/media/${result.record.id}`);
  });

  it('getUrl returns url for existing id', async () => {
    const service = createMediaService(mockMediaStoragePort);
    const { record } = await service.upload({
      body: new ArrayBuffer(0),
      filename: 'a.mp4',
      mimeType: 'video/mp4',
    });
    const url = await service.getUrl(record.id);
    expect(url).toBe(`/api/media/${record.id}`);
  });

  it('getUrl returns null for unknown id', async () => {
    const service = createMediaService(mockMediaStoragePort);
    const url = await service.getUrl('media-nonexistent');
    expect(url).toBeNull();
  });

  it('runs media mutation calls through write options only around the port write', async () => {
    const calls: string[] = [];
    const port: MediaStoragePort = {
      ...mockMediaStoragePort,
      updateDisplayName: vi.fn(async () => {
        calls.push('updateDisplayName');
        return true;
      }),
    };
    const service = createMediaService(port);

    await service.updateDisplayName('media-1', 'Name', {
      runMediaWrite: async (fn) => {
        calls.push('runner:start');
        const result = await fn();
        calls.push('runner:end');
        return result;
      },
    });

    expect(calls).toEqual(['runner:start', 'updateDisplayName', 'runner:end']);
  });
});
