import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const gateSource = fileURLToPath(
  new URL('../../../../../scripts/check-media-delivery-chokepoint.mjs', import.meta.url),
);

type FixtureFile = { path: string; source: string };

function runGate(files: FixtureFile[]): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'bcb-media-delivery-gate-'));
  const gate = join(root, 'scripts/check-media-delivery-chokepoint.mjs');
  try {
    mkdirSync(dirname(gate), { recursive: true });
    mkdirSync(join(root, 'apps/webapp/src/app/api'), { recursive: true });
    mkdirSync(join(root, 'apps/webapp/src/modules'), { recursive: true });
    copyFileSync(gateSource, gate);
    for (const file of files) {
      const destination = join(root, file.path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, file.source, 'utf8');
    }
    const result = spawnSync(process.execPath, [gate], { cwd: root, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const routePath = 'apps/webapp/src/app/api/media/[id]/download/route.ts';

describe('media delivery chokepoint structural gate', () => {
  it('rejects syntax-equivalent and renamed HTTP delivery bypasses', () => {
    const cases: Array<{ name: string; files: FixtureFile[] }> = [
      {
        name: 'aliased ACL import',
        files: [
          {
            path: routePath,
            source:
              "import { getMediaAccessRow as lookup } from '@/app-layer/media/s3MediaStorage';\nvoid lookup;\n",
          },
        ],
      },
      {
        name: 'relative ACL import',
        files: [
          {
            path: routePath,
            source:
              "import { getMediaAccessRow } from '../../../../../app-layer/media/s3MediaStorage';\nvoid getMediaAccessRow;\n",
          },
        ],
      },
      {
        name: 'dynamic ACL import',
        files: [
          {
            path: routePath,
            source:
              "export async function GET() { return (await import('@/app-layer/media/s3MediaStorage')).getMediaAccessRow('00000000-0000-4000-8000-000000000099'); }\n",
          },
        ],
      },
      {
        name: 'namespace ACL import',
        files: [
          {
            path: routePath,
            source:
              "import * as storage from '@/app-layer/media/s3MediaStorage';\nexport async function GET() { return storage.getMediaAccessRow('00000000-0000-4000-8000-000000000099'); }\n",
          },
        ],
      },
      {
        name: 're-export shim',
        files: [
          {
            path: 'apps/webapp/src/app/api/media/[id]/download/deliveryShim.ts',
            source:
              "export { getMediaAccessRow as lookup } from '@/app-layer/media/s3MediaStorage';\n",
          },
          {
            path: routePath,
            source:
              "import { lookup } from './deliveryShim';\nexport async function GET() { return lookup('00000000-0000-4000-8000-000000000099'); }\n",
          },
        ],
      },
      {
        name: 'relative infra S3 import',
        files: [
          {
            path: routePath,
            source:
              "import { s3PublicUrl } from '../../../../../infra/s3/client';\nexport function GET() { return Response.redirect(s3PublicUrl('media/foreign.mp4')); }\n",
          },
        ],
      },
      {
        name: 'raw S3 SDK route',
        files: [
          {
            path: routePath,
            source:
              "import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';\nexport function GET() { return new S3Client({}).send(new GetObjectCommand({ Bucket: 'private', Key: 'media/foreign.mp4' })); }\n",
          },
        ],
      },
      {
        name: 'raw S3 SDK module',
        files: [
          {
            path: 'apps/webapp/src/modules/media/newDelivery.ts',
            source:
              "import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';\nexport function deliver() { return new S3Client({}).send(new GetObjectCommand({ Bucket: 'private', Key: 'media/foreign.mp4' })); }\n",
          },
        ],
      },
      {
        name: 'renamed app-layer helper',
        files: [
          {
            path: 'apps/webapp/src/app-layer/media/newDelivery.ts',
            source:
              "import { getMediaAccessRow } from '@/app-layer/media/s3MediaStorage';\nexport const deliverWithoutSubmissionAcl = getMediaAccessRow;\n",
          },
          {
            path: routePath,
            source:
              "import { deliverWithoutSubmissionAcl } from '@/app-layer/media/newDelivery';\nexport async function GET() { return Response.json(await deliverWithoutSubmissionAcl('00000000-0000-4000-8000-000000000099')); }\n",
          },
        ],
      },
    ];

    const missed = cases
      .map(({ name, files }) => ({ name, result: runGate(files) }))
      .filter(({ result }) => result.status === 0)
      .map(({ name }) => name);

    expect(missed, `gate accepted reachable bypasses: ${missed.join(', ')}`).toEqual([]);
  });

  it('does not reject upload and background storage maintenance paths', () => {
    const result = runGate([
      {
        path: 'apps/webapp/src/app/api/media/multipart/complete/route.ts',
        source:
          "import { s3CompleteMultipartUpload } from '@/app-layer/media/s3Client';\nvoid s3CompleteMultipartUpload;\n",
      },
      {
        path: 'apps/webapp/src/app-layer/media/backgroundDelete.ts',
        source: "import { s3DeleteObject } from '@/infra/s3/client';\nvoid s3DeleteObject;\n",
      },
    ]);

    expect(result.status, result.output).toBe(0);
  });
});
