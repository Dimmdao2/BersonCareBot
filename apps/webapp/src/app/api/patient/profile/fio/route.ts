import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  isCyrillicFioInput,
  isCyrillicFioInputOrEmpty,
  normalizeFioPart,
} from '@/shared/lib/fio';

const schema = z
  .object({
    lastName: z.string().trim().min(1).refine(isCyrillicFioInput, FIO_LATIN_REJECTED_MESSAGE),
    firstName: z.string().trim().min(1).refine(isCyrillicFioInput, FIO_LATIN_REJECTED_MESSAGE),
    patronymic: z.string().refine(isCyrillicFioInputOrEmpty, FIO_LATIN_REJECTED_MESSAGE).nullable(),
  })
  .strict();

export async function PATCH(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_fio' }, { status: 400 });
  }
  const lastName = normalizeFioPart(parsed.data.lastName);
  const firstName = normalizeFioPart(parsed.data.firstName);
  const patronymic = normalizeFioPart(parsed.data.patronymic);
  if (!lastName || !firstName) {
    return NextResponse.json({ ok: false, error: 'fio_required' }, { status: 400 });
  }
  const fio = await buildAppDeps().userProjection.updateCurrentPatientFio({
    lastName,
    firstName,
    patronymic,
  });
  if (!fio) return NextResponse.json({ ok: false, error: 'patient_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, fio });
}
