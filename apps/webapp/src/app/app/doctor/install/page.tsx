import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { StaffPwaInstallSection } from "@/shared/ui/doctor/pwa/StaffPwaInstallSection";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Установить приложение — кабинет",
};

export default async function DoctorInstallPage() {
  return (
    <DoctorAppShell title="Установить приложение">
      <section className={cn(doctorSectionCardClass, "max-w-xl")}>
        <h2 className={doctorSectionTitleClass}>Установка на устройство</h2>
        <StaffPwaInstallSection />
      </section>
    </DoctorAppShell>
  );
}
