import '../../../../styles/doctor.css';
import { redirect } from 'next/navigation';
import { requireStaffPersonalInstallPage } from '@/app-layer/guards/requireRole';

/** Personal-only install entry; it intentionally sits outside the clinical `/app/doctor` layout. */
export default async function DoctorInstallPage() {
  const session = await requireStaffPersonalInstallPage();
  const isPlatformOperator = session.user.role === 'admin';
  redirect(isPlatformOperator ? '/app/admin' : '/app/account?tab=install');
}
