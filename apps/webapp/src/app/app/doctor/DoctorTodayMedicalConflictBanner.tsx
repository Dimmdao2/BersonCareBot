import Link from 'next/link';
import { loadDoctorMedicalConflictAttention } from '@/app-layer/patient-merge-candidate/loadDoctorMedicalConflictAttention';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';

export async function DoctorTodayMedicalConflictBanner({
  workspace,
}: {
  workspace: { organizationId: string };
}) {
  const attention = await loadDoctorMedicalConflictAttention(workspace);
  if (!attention.show) return null;
  const suffix = attention.count === 1 ? '' : `: ${attention.count}`;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
      <Link href={attention.href} className={`${doctorInlineLinkClass} font-medium`}>
        Требует вашего внимания: конфликт учётных записей клиента{suffix}
      </Link>
    </div>
  );
}
