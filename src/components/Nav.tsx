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
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3">
        <Link
          href="/"
          className="focus-ring flex items-center gap-2 rounded-lg text-sm font-semibold tracking-tight text-foreground no-underline"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
              <path
                d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          anyupload
        </Link>

        {/* usePathname reads request-time data, so it needs a Suspense
            boundary for the route to keep its static shell. */}
        <Suspense fallback={<NavLinksFallback />}>
          <NavLinks />
        </Suspense>

        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-xs text-muted md:block">
            send from one device · fetch from another
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NavLinksFallback() {
  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => (
        <span
          key={link.href}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted"
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
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`focus-ring rounded-lg px-3 py-1.5 text-sm font-medium no-underline transition-colors ${
              active
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
