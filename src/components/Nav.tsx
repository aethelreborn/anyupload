"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "/anyupload/send", label: "Send" },
  { href: "/anyupload/receive", label: "Receive" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border-strong bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-4 sm:px-5">
        <Link
          href="/"
          className="focus-ring flex min-h-11 items-center gap-2.5 rounded-sm text-foreground no-underline"
        >
          <span className="flex size-9 items-center justify-center border border-foreground bg-foreground text-background">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
              <path
                d="M5 17.5h14M7.5 12h9M12 4v8m0 0 3-3m-3 3L9 9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="square"
              />
            </svg>
          </span>
          <span className="leading-none">
            <span className="block text-[15px] font-semibold tracking-tight">anyupload</span>
            <span className="mt-1 hidden font-mono text-[9px] uppercase tracking-[0.18em] text-muted sm:block">
              transfer desk
            </span>
          </span>
        </Link>

        <span className="mx-1 hidden h-7 w-px bg-border sm:block" aria-hidden="true" />

        {/* usePathname reads request-time data, so it needs a Suspense
            boundary for the route to keep its static shell. */}
        <Suspense fallback={<NavLinksFallback />}>
          <NavLinks />
        </Suspense>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted lg:flex">
            <span className="size-1.5 bg-success" aria-hidden="true" />
            route open
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NavLinksFallback() {
  return (
    <nav className="flex items-center gap-0.5">
      {links.map((link) => (
        <span
          key={link.href}
          className="inline-flex min-h-11 items-center px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"
        >
          {link.label}
        </span>
      ))}
    </nav>
  );
}

function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5" aria-label="Transfer desk">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`focus-ring relative inline-flex min-h-11 items-center rounded-sm px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] no-underline transition-colors ${
              active
                ? "text-foreground after:absolute after:inset-x-2.5 after:bottom-0 after:h-[2px] after:bg-signal"
                : "text-muted hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
