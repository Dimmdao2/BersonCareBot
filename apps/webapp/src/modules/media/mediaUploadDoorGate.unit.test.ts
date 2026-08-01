import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webappRoot = fileURLToPath(new URL('../../../', import.meta.url));
const gateSource = path.join(webappRoot, 'scripts', 'check-media-upload-door.mjs');

type FixtureTree = Record<string, string>;

async function runGate(fixtures: FixtureTree): Promise<{
  status: number | null;
  output: string;
}> {
  const tempRoot = await mkdtemp(path.join(webappRoot, '.tmp-media-upload-door-gate-'));
  try {
    const copiedGate = path.join(tempRoot, 'scripts', 'check-media-upload-door.mjs');
    await mkdir(path.dirname(copiedGate), { recursive: true });
    await copyFile(gateSource, copiedGate);
    await mkdir(path.join(tempRoot, 'src'), { recursive: true });
    for (const [relativePath, source] of Object.entries(fixtures)) {
      const target = path.join(tempRoot, 'src', relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source, 'utf8');
    }
    const result = spawnSync(process.execPath, [copiedGate, '--self-test'], {
      cwd: tempRoot,
      encoding: 'utf8',
    });
    return {
      status: result.status,
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const bypassFixtures: Array<[string, FixtureTree]> = [
  [
    'a planted seventh formData route',
    {
      'app/api/seventh/route.ts':
        'export async function POST(request: Request) { await request.formData(); }',
    },
  ],
  [
    'an aliased relative raw-storage import',
    {
      'app/api/seventh/route.ts':
        "import { presignPutUrl as issue } from '../../../../infra/s3/client'; issue('k', 'm');",
    },
  ],
  [
    'a dynamic raw-storage import',
    { 'app/api/seventh/route.ts': "void import('@/infra/s3/client');" },
  ],
  [
    'a namespace raw-storage import',
    {
      'app/api/seventh/route.ts':
        "import * as storage from '@/app-layer/media/s3Client'; void storage.presignPutUrl;",
    },
  ],
  [
    'a raw S3 SDK import',
    {
      'app/api/seventh/route.ts':
        "import { PutObjectCommand } from '@aws-sdk/client-s3'; new PutObjectCommand({});",
    },
  ],
  [
    'a raw-storage re-export',
    {
      'app/api/seventh/route.ts': "export * from '@/infra/s3/client';",
    },
  ],
  [
    'a renamed helper wrapping raw storage',
    {
      'app-layer/media/renamedUpload.ts':
        "import { presignPutUrl } from '@/infra/s3/client'; export const issueUpload = presignPutUrl;",
      'app/api/seventh/route.ts':
        "import { issueUpload } from '@/app-layer/media/renamedUpload'; void issueUpload('k', 'm');",
    },
  ],
  [
    'a direct pending repository primitive',
    {
      'app/api/seventh/route.ts':
        "import { insertPendingMediaFileTx } from '@/app-layer/media/s3MediaStorage'; void insertPendingMediaFileTx;",
    },
  ],
  [
    'an aliased direct ready repository primitive',
    {
      'app/api/seventh/route.ts':
        "import { confirmMediaFileReady as markReady } from '@/app-layer/media/s3MediaStorage'; void markReady('id', {});",
    },
  ],
  [
    'a route calling adapter presign without preparing an intent',
    {
      'app/api/seventh/route.ts':
        "import { presignPreparedUpload } from '@/app-layer/media/mediaUploadAdapter'; void presignPreparedUpload({});",
    },
  ],
  [
    'a route calling adapter multipart complete directly',
    {
      'app/api/seventh/route.ts':
        "import { completePreparedMultipartUpload } from '@/app-layer/media/mediaUploadAdapter'; void completePreparedMultipartUpload('k', 'u', []);",
    },
  ],
  [
    'a route casting a forged received-object mark',
    {
      'app/api/seventh/route.ts':
        "import { acceptReceivedMedia } from '@/app-layer/media/mediaUploadAdapter'; import type { ReceivedUpload } from '@/modules/media/uploadValidation'; const forged = {} as ReceivedUpload; void acceptReceivedMedia('id', forged);",
    },
  ],
  [
    'a comment that fakes the door marker',
    {
      'app/api/seventh/route.ts':
        'export async function POST(request: Request) { await request.formData(); /* prepareMediaUpload() */ }',
    },
  ],
];

describe('media upload structural gate fixtures', () => {
  it.each(bypassFixtures)('turns red for %s', async (_name, fixture) => {
    const result = await runGate(fixture);

    expect(result.status, result.output).not.toBe(0);
  });

  it('keeps download, background preview, delete, and purge negative controls green', async () => {
    const result = await runGate({
      'app/api/media/[id]/route.ts':
        "import { presignGetUrl } from '@/app-layer/media/s3Client'; void presignGetUrl('k');",
      'app/api/media/[id]/delete/route.ts':
        "import { s3DeleteObject } from '@/app-layer/media/s3Client'; void s3DeleteObject('k');",
      'app-layer/media/backgroundPreview.ts':
        "import { GetObjectCommand } from '@aws-sdk/client-s3'; void GetObjectCommand;",
      'app-layer/media/purge.ts':
        "import { s3DeleteObject } from '@/infra/s3/client'; void s3DeleteObject;",
    });

    expect(result.status, result.output).toBe(0);
  });
});
