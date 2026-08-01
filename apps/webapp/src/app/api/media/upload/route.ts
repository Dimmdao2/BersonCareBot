import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { pgValidateUserAssignableMediaFolder } from '@/app-layer/media/clientMediaFolders';
import { logger } from '@/app-layer/logging/logger';
import { uploadValidationResponse, validateUploadIntent } from '@/modules/media/uploadValidation';
import { validateBufferedMediaUpload } from '@/app-layer/media/mediaUploadAdapter';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

type UploadCandidate = {
  file: File;
  filename: string;
  mime: string;
  body: ArrayBuffer;
  received: import('@/modules/media/uploadValidation').ReceivedUpload;
};

type UploadCandidateMeta = {
  file: File;
  filename: string;
  mime: string;
  intent: import('@/modules/media/uploadValidation').UploadIntent;
};

const MEDIA_FOLDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveUploadFolderIdFromForm(
  folderExists: (folderId: string) => Promise<boolean>,
  form: FormData,
): Promise<
  | { ok: true; folderId: string | null | undefined }
  | { ok: false; status: number; payload: Record<string, unknown> }
> {
  const raw = form.get('folderId');
  if (raw === null || raw === undefined) return { ok: true, folderId: undefined };
  if (typeof raw !== 'string') return { ok: true, folderId: undefined };
  const t = raw.trim();
  if (t === '' || t === 'root') return { ok: true, folderId: null };
  if (!MEDIA_FOLDER_ID_RE.test(t)) {
    return { ok: false, status: 400, payload: { error: 'invalid_folder_id' } };
  }
  const exists = await folderExists(t);
  if (!exists) {
    return { ok: false, status: 400, payload: { error: 'folder_not_found' } };
  }
  const assignable = await pgValidateUserAssignableMediaFolder(t);
  if (!assignable.ok) {
    return { ok: false, status: 400, payload: { error: assignable.error } };
  }
  return { ok: true, folderId: t };
}

function collectFilesFromForm(form: FormData): File[] {
  const fromSingle = form.get('file');
  const fromFiles = form.getAll('files');
  const fromFilesArray = form.getAll('files[]');
  const all = [fromSingle, ...fromFiles, ...fromFilesArray];
  return all.filter((entry): entry is File => entry instanceof File);
}

function validateFile(
  file: File,
  index: number,
):
  | { ok: true; value: UploadCandidateMeta }
  | { ok: false; status: number; payload: Record<string, unknown> } {
  const validated = validateUploadIntent({
    filename: file.name || 'upload',
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    policyId: 'proxy',
  });
  if (!validated.ok) {
    const rejection = uploadValidationResponse(validated);
    return {
      ok: false,
      status: rejection.status,
      payload: { ...rejection.body, index, filename: file.name || 'upload' },
    };
  }
  return {
    ok: true,
    value: {
      file,
      filename: validated.value.filename,
      mime: validated.value.mimeType,
      intent: validated.value,
    },
  };
}

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const session = gate.ctx.session;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'expected_multipart' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const files = collectFilesFromForm(form);
  if (files.length === 0) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const folderRes = await resolveUploadFolderIdFromForm(
    (folderId) => deps.media.folderExists(folderId),
    form,
  );
  if (!folderRes.ok) {
    return NextResponse.json(folderRes.payload, { status: folderRes.status });
  }

  const candidates: UploadCandidate[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!;
    const validation = validateFile(file, i);
    if (!validation.ok) {
      return NextResponse.json(validation.payload, { status: validation.status });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const received = validateBufferedMediaUpload(validation.value.intent, bytes);
    if (!received.ok) {
      const rejection = uploadValidationResponse(received);
      return NextResponse.json(
        { ...rejection.body, index: i, filename: validation.value.filename },
        { status: rejection.status },
      );
    }
    candidates.push({
      ...validation.value,
      body: bytes.buffer,
      received: received.value,
    });
  }

  const uploaded: Array<{
    mediaId: string;
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }> = [];
  try {
    for (const candidate of candidates) {
      const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
        deps.media.upload({
          body: candidate.body,
          filename: candidate.filename,
          mimeType: candidate.mime,
          received: candidate.received,
          userId: session.user.userId,
          ...(folderRes.folderId !== undefined ? { folderId: folderRes.folderId } : {}),
        }),
      );
      uploaded.push({
        mediaId: result.record.id,
        url: result.url,
        filename: candidate.filename,
        mimeType: candidate.mime,
        size: candidate.file.size,
      });
    }
    if (uploaded.length === 1) {
      const single = uploaded[0]!;
      return NextResponse.json({
        ok: true as const,
        mediaId: single.mediaId,
        url: single.url,
        uploaded,
      });
    }
    return NextResponse.json({
      ok: true as const,
      uploaded,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'upload_failed';
    if (msg === 'media_upload_too_large') {
      return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
    }
    logger.error({ err: e }, '[media/upload] failed');
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
