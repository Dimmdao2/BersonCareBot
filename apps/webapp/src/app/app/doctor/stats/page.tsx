import { redirect } from 'next/navigation';

export default async function DoctorStatsRedirectPage() {
  redirect('/app/admin/analytics');
}
