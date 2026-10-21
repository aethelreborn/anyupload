"use client";

import { useEffect, useState } from "react";
import { TextIcon } from "@/components/Icons";

export function TextPreview({ url, name }: { url: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("bad status"))))
      .then((content) => {
        if (cancelled) return;
        setText(content.slice(0, 600));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url]);

  return (
    <div className="h-full w-full overflow-hidden bg-surface-2 px-3 pb-3 pt-9 text-left">
      {failed ? (
        <p className="text-xs text-muted">Preview unavailable.</p>
      ) : text === null ? (
        <div className="space-y-1.5">
          <div className="h-2 w-3/4 rounded bg-border" />
          <div className="h-2 w-full rounded bg-border" />
          <div className="h-2 w-5/6 rounded bg-border" />
        </div>
      ) : (
        <>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted">
            <TextIcon className="size-3" />
            {name}
          </p>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/80">
            {text}
          </pre>
        </>
      )}
    </div>
  );
}
