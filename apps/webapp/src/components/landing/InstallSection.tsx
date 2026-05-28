import { landingContainer, landingInstallAnchor } from "@/components/landing/landingTypography";
import { InstallSectionClient } from "@/components/landing/InstallSectionClient";
import { cn } from "@/lib/utils";

export function InstallSection() {
  return (
    <section
      id="install"
      className={cn(
        "relative overflow-hidden bg-[#F4F7FF] py-12 sm:py-14 lg:py-20",
        landingInstallAnchor,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D5DEF1] to-transparent"
        aria-hidden
      />
      <div className={landingContainer}>
        <InstallSectionClient />
      </div>
    </section>
  );
}
