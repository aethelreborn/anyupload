import Link from "next/link";
import { Nav } from "@/components/Nav";
import { InboxIcon, UploadIcon } from "@/components/Icons";

const STEPS = [
  {
    title: "Drop the parcel",
    body: "Pick files, a whole folder, or paste text. The queue holds everything on this device until you send it.",
  },
  {
    title: "It goes direct",
    body: "The browser uploads straight to the bucket in parallel parts. Large files retry on their own, without freezing the tab.",
  },
  {
    title: "Collect anywhere",
    body: "Open the receive desk on the other device. Search, preview, copy the link, or take everything as a ZIP.",
  },
];

const SPECS = [
  {
    label: "Direct route",
    body: "Bytes travel browser → bucket. The app server never holds your file, so the usual upload caps do not apply.",
  },
  {
    label: "Large files",
    body: "Parallel multipart uploads, three retries, and progress updates that do not stall the interface.",
  },
  {
    label: "Handoff link",
    body: "Every upload gets a permanent link. No account and no login on either end of the transfer.",
  },
  {
    label: "The inbox",
    body: "Search, sort, thumbnail previews, notes, and ZIP downloads in one place.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav />

      <main className="flex-1">
        <section className="desk-grid border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:py-20">
            <div>
              <p className="eyebrow flex items-center gap-2">
                <span className="size-1.5 bg-signal" aria-hidden="true" />
                Cross-device file handoff
              </p>

              <h1 className="mt-5 max-w-xl text-balance text-[clamp(2.7rem,7vw,4.8rem)] font-semibold leading-[0.93] tracking-[-0.05em]">
                Send it from this desk.
                <span className="mt-1 block text-muted">Collect it at the other.</span>
              </h1>

              <p className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-muted sm:text-lg">
                anyupload moves files, folders, and text between your devices
                through a direct browser-to-bucket route. No account, no app,
                no cable.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/anyupload/send"
                  className="btn btn-primary px-5 no-underline"
                >
                  <UploadIcon className="size-4" />
                  Open the send desk
                </Link>
                <Link
                  href="/anyupload/receive"
                  className="btn btn-secondary px-5 no-underline"
                >
                  <InboxIcon className="size-4" />
                  Open the receive desk
                </Link>
              </div>

              <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-border-strong pt-4">
                {[
                  ["Account", "none"],
                  ["Per file", "up to 5 GB"],
                  ["Link", "permanent"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="field-label">{label}</dt>
                    <dd className="mt-1.5 font-mono text-xs text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="label-frame overflow-hidden">
              <div className="flex items-center justify-between border-b border-border-strong bg-surface-2 px-4 py-2.5">
                <span className="field-label">transfer route</span>
                <span className="badge border-success/50 text-success">
                  <span className="size-1.5 bg-success" aria-hidden="true" />
                  open
                </span>
              </div>

              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="field-label">parcel</p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight">
                      One file. Any type.
                    </p>
                  </div>
                  <div className="barcode h-9 w-24 opacity-60" aria-hidden="true" />
                </div>

                <ol className="relative mt-7 space-y-6">
                  <span
                    className="route-dash-y absolute bottom-3 left-[7px] top-3 w-px"
                    aria-hidden="true"
                  />

                  <RouteStop
                    index="01 / origin"
                    title="This device"
                    detail="Drop files, a folder, or text"
                    marker="border-accent bg-surface"
                    meta="ready"
                  />
                  <RouteStop
                    index="02 / transit"
                    title="Signed bucket route"
                    detail="The browser uploads directly"
                    marker="border-signal bg-signal"
                    meta="signed"
                    signal
                  />
                  <RouteStop
                    index="03 / destination"
                    title="Any other device"
                    detail="Collect it from the receive desk"
                    marker="border-foreground bg-surface"
                    meta="anywhere"
                  />
                </ol>

                <div className="mt-7 flex items-center justify-between border-t border-border pt-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    no account required
                  </span>
                  <Link
                    href="/anyupload/send"
                    className="focus-ring inline-flex min-h-11 items-center font-mono text-[10px] uppercase tracking-[0.12em] text-accent underline-offset-4 hover:underline"
                  >
                    start the route →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">the handoff</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Three moves. No setup.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted">
              The app server never carries the file. Your browser talks
              straight to the bucket, and the receive desk reads it back.
            </p>
          </div>

          <div className="panel-raised mt-6 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border-strong bg-surface-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <span>origin</span>
              <span className="route-dash h-px flex-1" aria-hidden="true" />
              <span>bucket</span>
              <span className="route-dash h-px flex-1" aria-hidden="true" />
              <span>destination</span>
            </div>

            <ol className="grid sm:grid-cols-3 sm:divide-x sm:divide-border">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="border-b border-border p-5 last:border-b-0 sm:border-b-0 sm:p-6"
                >
                  <span className="font-mono text-[11px] font-medium text-signal-ink">
                    0{index + 1}
                  </span>
                  <h3 className="mt-3 text-base font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-12 sm:pb-16">
          <div className="grid gap-8 border-t border-border-strong pt-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <p className="eyebrow">spec sheet</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Built for the awkward transfer.
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
                The file is on a lab machine. You are on a laptop. The chat app
                will not take it. That is the job.
              </p>
            </div>

            <dl className="divide-y divide-border-strong border-y border-border-strong">
              {SPECS.map((spec) => (
                <div
                  key={spec.label}
                  className="grid gap-1 py-4 sm:grid-cols-[150px_1fr] sm:gap-6"
                >
                  <dt className="field-label pt-0.5">{spec.label}</dt>
                  <dd className="text-sm leading-relaxed text-muted">
                    {spec.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-14 sm:pb-20">
          <div className="border border-foreground bg-foreground px-5 py-7 text-background sm:px-8 sm:py-9">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-background/60">
                  ready when the file is
                </p>
                <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                  The other desk is one link away.
                </h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/anyupload/send"
                  className="btn bg-background text-foreground hover:bg-surface-2 no-underline"
                >
                  <UploadIcon className="size-4" />
                  Send a file
                </Link>
                <Link
                  href="/anyupload/receive"
                  className="btn border-background/40 text-background hover:bg-background/10 no-underline"
                >
                  <InboxIcon className="size-4" />
                  Open the inbox
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-strong">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:flex-row sm:items-center sm:justify-between">
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

function RouteStop({
  index,
  title,
  detail,
  marker,
  meta,
  signal = false,
}: {
  index: string;
  title: string;
  detail: string;
  marker: string;
  meta: string;
  signal?: boolean;
}) {
  return (
    <li className="relative grid grid-cols-[16px_minmax(0,1fr)_auto] gap-3">
      <span
        className={`mt-1.5 size-3.5 border-2 ${marker} ${
          signal ? "signal-pulse" : ""
        }`}
        aria-hidden="true"
      />
      <div>
        <p className="field-label">{index}</p>
        <p className="mt-1 text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
      </div>
      <span className="field-label pt-0.5">{meta}</span>
    </li>
  );
}
