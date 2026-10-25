import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

export default function AnyuploadLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-5 sm:py-9">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>anyupload / transfer desk</p>
          <p className="flex items-center gap-2">
            <span className="size-1.5 bg-success" aria-hidden="true" />
            browser → bucket → browser
          </p>
        </div>
      </footer>
    </div>
  );
}
