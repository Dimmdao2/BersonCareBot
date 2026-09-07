import Link from 'next/link';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { MANAGEMENT_NAV } from './managementNav';

export default async function ManagementPage() {
  return (
    <>
      <DoctorPageHeader title="Управление клиникой" />
      <div className="flex flex-col gap-3">
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Управление клиникой</DoctorSectionTitle>
          </DoctorSectionHeader>
          <nav aria-label="Разделы управления" className="grid gap-2 sm:grid-cols-2">
            {MANAGEMENT_NAV.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </DoctorSection>
      </div>
    </>
  );
}
