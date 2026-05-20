import {
  landingContainer,
  landingH2,
  landingInstallAnchor,
} from "@/components/landing/landingTypography";
import { InstallSectionClient } from "@/components/landing/InstallSectionClient";
import { cn } from "@/lib/utils";

export function InstallSection() {
  return (
    <section id="install" className={cn("bg-[#F8FAFF] py-8 sm:py-10 lg:py-14", landingInstallAnchor)}>
      <div className={landingContainer}>
        <h2 className={cn(landingH2, "text-center")}>Как установить приложение</h2>
        <InstallSectionClient />
      </div>
    </section>
  );
}
