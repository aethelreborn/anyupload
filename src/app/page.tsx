import Link from "next/link";
import { Nav } from "@/components/Nav";
import {
  BoltIcon,
  CloudIcon,
  InboxIcon,
  ShieldIcon,
  UploadIcon,
} from "@/components/Icons";

const STEPS = [
  {
    title: "Pick what you want to send",
    body: "Files with no extension, whole folders, or a snippet of text. Drag it in or browse for it.",
  },
  {
    title: "Watch it go",
    body: "The bytes travel from your browser straight into the bucket. Big files are split into parts and sent in parallel.",
  },
  {
    title: "Grab the link",
    body: "Every upload gets its own permanent link. Send it over and the file is one click away.",
  },
];

const FEATURES = [
  {
    icon: CloudIcon,
    title: "No size limit to fight",
    body: "The app server never touches your file, so the usual upload caps simply do not apply.",
  },
  {
    icon: BoltIcon,
    title: "Fast on a slow link",
    body: "Large files are uploaded in parts, retried on their own and sent in parallel.",
  },
  {
    icon: ShieldIcon,
    title: "Straight to the bucket",
    body: "Uploads are authorised per file and signed, so the bytes go where they belong and nowhere else.",
  },
  {
    icon: InboxIcon,
    title: "Everything in one place",
    body: "The receive page lists every file with previews, notes, sizes and a one click download.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-14 sm:py-20">
        <section className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            browser → bucket direct upload
          </span>

          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Send a file from one device.
            <span className="block text-muted">Pick it up on another.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            Found something on the lab machine? Put it here, then pull it down on
            your laptop from anywhere. Any file type, any size, whole folders, or
            just a snippet of text.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/anyupload/send" className="btn btn-primary px-5 py-2.5 text-base">
              <UploadIcon className="size-4" />
              Start an upload
            </Link>
            <Link href="/anyupload/receive" className="btn btn-secondary px-5 py-2.5 text-base">
              <InboxIcon className="size-4" />
              Open the inbox
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted">
            Every upload gets its own permanent link. The receive page lists them
            all as a grid.
          </p>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="panel-raised p-5">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold text-accent">
                {index + 1}
              </span>
              <h2 className="mt-3 text-sm font-semibold">{step.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Why it holds up
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="panel flex gap-4 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <feature.icon className="size-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {feature.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Files travel straight from your browser to the bucket, so they never
            pass through the app server.
          </p>
          <p>anyupload</p>
        </div>
      </footer>
    </div>
  );
}
