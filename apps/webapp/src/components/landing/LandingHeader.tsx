"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Установить", href: "#install" },
  { label: "Функционал", href: "#features" },
  { label: "Об авторе", href: "#specialist" },
  { label: "Контакты", href: "#contacts" },
] as const;

const SCROLL_COMPACT_THRESHOLD_PX = 12;

const barHeightClass = {
  default: "h-14 sm:h-16 lg:h-20",
  compact: "h-[3.25rem] sm:h-14 lg:h-16",
} as const;

export function LandingHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onScroll() {
      setIsCompact(window.scrollY > SCROLL_COMPACT_THRESHOLD_PX);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    function onOutsideClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutsideClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutsideClick);
    };
  }, [isOpen]);

  const heightClass = isCompact ? barHeightClass.compact : barHeightClass.default;

  return (
    <>
      <div
        aria-hidden
        className={cn("shrink-0 transition-[height] duration-300 ease-out motion-reduce:transition-none", heightClass)}
      />
      <header
        ref={headerRef}
        className={cn(
          "fixed inset-x-0 top-0 z-30 border-b border-[#DDE3F0] bg-white transition-[box-shadow] duration-300 ease-out motion-reduce:transition-none",
          isCompact && "shadow-sm",
        )}
      >
        <div
          className={cn(
            landingContainer,
            "flex items-center justify-between transition-[height] duration-300 ease-out motion-reduce:transition-none",
            heightClass,
          )}
        >
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2 font-semibold tracking-tight text-[#17264A] transition-[font-size] duration-300 ease-out motion-reduce:transition-none",
              isCompact ? "text-[0.9375rem] sm:text-[1.0625rem] lg:text-lg" : "text-base sm:text-lg lg:text-xl",
            )}
          >
            <Image
              src="/apple-touch-icon.png"
              alt=""
              width={36}
              height={36}
              className={cn(
                "rounded-xl transition-[width,height] duration-300 ease-out motion-reduce:transition-none",
                isCompact ? "h-8 w-8 sm:h-[2.125rem] sm:w-[2.125rem]" : "h-8 w-8 sm:h-9 sm:w-9",
              )}
              priority
            />
            BersonCare
          </Link>

          <button
            type="button"
            aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isOpen}
            aria-controls="landing-nav"
            onClick={() => setIsOpen((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#17264A] transition hover:bg-[#F4F7FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F55B7]/40"
          >
            {isOpen ? <X className="h-5 w-5" strokeWidth={2} /> : <Menu className="h-5 w-5" strokeWidth={2} />}
          </button>
        </div>

        {isOpen && (
          <nav
            id="landing-nav"
            aria-label="Навигация по странице"
            className="border-b border-[#DDE3F0] bg-white shadow-md"
          >
            <ul className={cn(landingContainer, "flex flex-col py-1")}>
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex w-full py-3.5 text-base font-medium text-[#17264A] transition hover:text-[#2F55B7]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
    </>
  );
}
