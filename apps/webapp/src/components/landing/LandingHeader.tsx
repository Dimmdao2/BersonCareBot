import Image from "next/image";
import Link from "next/link";
import { landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#DDE3F0] bg-white">
      <div className={cn(landingContainer, "flex h-14 items-center sm:h-16 lg:h-20")}>
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-[#17264A] sm:text-lg lg:text-xl"
        >
          <Image
            src="/apple-touch-icon.png"
            alt=""
            width={36}
            height={36}
            className="h-8 w-8 rounded-xl sm:h-9 sm:w-9"
            priority
          />
          BersonCare
        </Link>
      </div>
    </header>
  );
}
