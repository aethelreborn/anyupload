import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-16">
      <div className="animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="size-1.5 rounded-full bg-success" />
          browser → bucket direct upload
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
          anyupload
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Found something on the lab machine? Put it here, then pull it down on your
          laptop from anywhere. Any file type, any size, whole folders, or just a
          snippet of text.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/anyupload/send"
            className="group panel card-hover flex flex-col justify-between gap-8 p-6 no-underline"
          >
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <UploadIcon />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                Send
              </h2>
              <p className="mt-1 text-sm text-muted">
                Upload files, folders or text and grab a share link.
              </p>
            </div>
            <span className="text-sm font-medium text-accent">
              Start an upload →
            </span>
          </Link>

          <Link
            href="/anyupload/receive"
            className="group panel card-hover flex flex-col justify-between gap-8 p-6 no-underline"
          >
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <InboxIcon />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                Receive
              </h2>
              <p className="mt-1 text-sm text-muted">
                Browse everything that has been sent and download it.
              </p>
            </div>
            <span className="text-sm font-medium text-accent">
              Open the inbox →
            </span>
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted">
          Every upload gets its own permanent link. The receive page lists them
          all as a grid.
        </p>
      </div>
    </main>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
      <path
        d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
      <path
        d="M3 13h4l1.5 3h7L17 13h4M3 13l2.5-7.2A1.5 1.5 0 0 1 6.9 4.7h10.2a1.5 1.5 0 0 1 1.4 1.1L21 13v4.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5V13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
