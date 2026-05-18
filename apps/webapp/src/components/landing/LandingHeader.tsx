import Link from "next/link";
import { Menu } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

const nav = [
  { href: "#features", label: "Возможности" },
  { href: "#about", label: "О приложении" },
  { href: "#specialist", label: "Специалист" },
  { href: "#install", label: "Установка" },
] as const;

const installBtnClass = cn(
  buttonVariants({ size: "default" }),
  "rounded-xl bg-[#2F55B7] text-sm font-semibold text-white hover:bg-[#2448A5]",
);

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#DDE3F0]/60 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-full items-center justify-between gap-3 px-5 sm:px-6 md:max-w-3xl md:px-6 lg:h-[72px] lg:max-w-6xl lg:px-8">

        {/* Logo */}
        <Link href="/" className="flex min-w-0 items-center gap-2.5 text-[#17264A]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#2F55B7]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 2C5.239 2 3 4.239 3 7c0 1.657.784 3.13 2 4.063V13h6v-1.937A5 5 0 0013 7c0-2.761-2.239-5-5-5z" fill="white" fillOpacity=".9"/>
              <rect x="5" y="13" width="6" height="1.5" rx=".75" fill="white" fillOpacity=".7"/>
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">BersonCare</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Разделы страницы">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[#667085] transition-colors hover:text-[#17264A]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <Link href={LANDING_INSTALL_HASH} className={installBtnClass}>
            Установить приложение
          </Link>

          {/* Mobile burger */}
          <details className="relative lg:hidden">
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-[#DDE3F0] bg-white text-[#17264A] [&::-webkit-details-marker]:hidden"
              aria-label="Меню"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-[#DDE3F0] bg-white p-2 shadow-lg">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[#17264A] hover:bg-[#EEF4FF]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </div>

      </div>
    </header>
  );
}
