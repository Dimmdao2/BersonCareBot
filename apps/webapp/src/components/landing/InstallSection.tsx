import { landingContainer, landingInstallAnchor } from "@/components/landing/landingTypography";
import { InstallSectionClient } from "@/components/landing/InstallSectionClient";
import { cn } from "@/lib/utils";

export function InstallSection({ appBaseUrl }: { appBaseUrl: string }) {
  return (
    <section
      id="install"
      className={cn("bg-white py-12 sm:py-14 lg:py-20", landingInstallAnchor)}
    >
      <div className={landingContainer}>
        <InstallSectionClient appBaseUrl={appBaseUrl} />
      </div>
    </section>
  );
}
