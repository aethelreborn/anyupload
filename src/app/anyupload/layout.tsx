import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

export default function AnyuploadLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-6 text-xs text-muted">
          Files travel straight from your browser to the bucket, so they never
          pass through the app server.
        </div>
      </footer>
    </div>
  );
}
