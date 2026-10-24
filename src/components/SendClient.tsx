"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  FolderIcon,
  LinkIcon,
  NoteIcon,
  SpinnerIcon,
  TextIcon,
  UploadIcon,
} from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { fileTone } from "@/lib/filetype";
import { formatBytes, formatDuration } from "@/lib/format";
import { fromDataTransfer, fromFileList, rootFolder, type PickedFile } from "@/lib/pick";

type Status = "queued" | "uploading" | "done" | "error" | "cancelled";

type QueueItem = {
  localId: string;
  name: string;
  path: string;
  size: number;
  mime: string;
  kind: "file" | "text";
  note: string;
  folder: string | null;
  body: Blob;
  status: Status;
  progress: number;
  /** Bytes per second, measured while the file is uploading. */
  speed?: number;
  error: string | null;
  warning: string | null;
  shareUrl: string | null;
  /** Reused on retry so a failed upload cannot leave a duplicate behind. */
  uploadId: string | null;
  /** Proof that this browser may write to `uploadId`. */
  session: string | null;
  key: string | null;
};

/** How the browser is told to deliver the bytes. Mirrors `BrowserUpload`. */
type UploadPlan =
  | { kind: "presigned"; url: string; headers: Record<string, string> }
  | { kind: "vercel-blob"; handleUploadUrl: string; multipart: boolean };

type InitResponse = {
  id: string;
  key: string;
  session: string;
  upload: UploadPlan;
  mime: string;
};

/** How many files are sent at the same time. */
const CONCURRENCY = 3;
/** How often the progress bars are repainted. */
const PROGRESS_INTERVAL_MS = 120;
/** Attempts per file before it is marked as failed. */
const MAX_ATTEMPTS = 3;
/** How long the note may take before it is written off as lost. */
const COMPLETE_TIMEOUT_MS = 30_000;

class UploadError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "UploadError";
    this.retryable = retryable;
  }
}

export function SendClient() {
  const toast = useToast();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [batchNote, setBatchNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");
  const [textName, setTextName] = useState("");
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);

  /** Latest progress per file, flushed to React on a timer. */
  const progressRef = useRef(new Map<string, number>());
  /** Byte counters used to derive the transfer speed. */
  const speedRef = useRef(new Map<string, { at: number; bytes: number }>());
  const controllersRef = useRef(new Map<string, AbortController>());

  // The folder picker is a non-standard attribute, so it is set imperatively.
  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  const commit = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback((localId: string, changes: Partial<QueueItem>) => {
    const next = itemsRef.current.map((item) =>
      item.localId === localId ? { ...item, ...changes } : item,
    );
    itemsRef.current = next;
    setItems(next);
  }, []);

  /**
   * Progress events arrive far faster than a human can read them, and one
   * React update per event is enough to make the tab unusable on a big file.
   * The values are collected here and painted on a timer instead.
   */
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      const updates = progressRef.current;
      if (updates.size === 0) return;
      progressRef.current = new Map();

      const now = Date.now();
      const next = itemsRef.current.map((item) => {
        const value = updates.get(item.localId);
        if (value === undefined || value === item.progress) return item;

        const bytes = value * item.size;
        const previous = speedRef.current.get(item.localId);
        let speed = 0;
        if (previous) {
          const seconds = (now - previous.at) / 1000;
          if (seconds > 0) speed = Math.max(0, (bytes - previous.bytes) / seconds);
        }
        speedRef.current.set(item.localId, { at: now, bytes });

        return { ...item, progress: value, speed };
      });

      itemsRef.current = next;
      setItems(next);
    }, PROGRESS_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [busy]);

  function reportProgress(localId: string, value: number) {
    progressRef.current.set(localId, Math.min(1, Math.max(0, value)));
  }

  function addPicked(picked: PickedFile[]) {
    if (picked.length === 0) return;
    const next: QueueItem[] = picked.map((entry) => ({
      localId: crypto.randomUUID(),
      name: entry.file.name || "untitled",
      path: entry.path,
      size: entry.file.size,
      mime: entry.file.type || "application/octet-stream",
      kind: "file",
      note: "",
      folder: rootFolder(entry.path),
      body: entry.file,
      status: "queued",
      progress: 0,
      error: null,
      warning: null,
      shareUrl: null,
      uploadId: null,
      session: null,
      key: null,
    }));
    commit([...itemsRef.current, ...next]);
  }

  function addText() {
    if (!text.trim()) return;
    // The original text is stored verbatim; only the emptiness check trims.
    const name =
      textName.trim() ||
      `note-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    commit([
      ...itemsRef.current,
      {
        localId: crypto.randomUUID(),
        name,
        path: name,
        size: blob.size,
        mime: "text/plain",
        kind: "text",
        note: "",
        folder: null,
        body: blob,
        status: "queued",
        progress: 0,
        error: null,
        warning: null,
        shareUrl: null,
        uploadId: null,
        session: null,
        key: null,
      },
    ]);
    setText("");
    setTextName("");
    setShowText(false);
  }

  function remove(localId: string) {
    controllersRef.current.get(localId)?.abort();
    controllersRef.current.delete(localId);
    progressRef.current.delete(localId);
    speedRef.current.delete(localId);
    commit(itemsRef.current.filter((item) => item.localId !== localId));
  }

  function clearFinished() {
    commit(
      itemsRef.current.filter(
        (item) => item.status !== "done" && item.status !== "cancelled",
      ),
    );
  }

  function cancel(localId: string) {
    const controller = controllersRef.current.get(localId);
    if (controller) {
      controller.abort();
    } else {
      patch(localId, { status: "cancelled", error: null });
    }
  }

  function cancelAll() {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
  }

  async function uploadOne(item: QueueItem, note: string) {
    const controller = new AbortController();
    controllersRef.current.set(item.localId, controller);

    patch(item.localId, {
      status: "uploading",
      progress: 0,
      error: null,
      warning: null,
    });
    speedRef.current.delete(item.localId);

    try {
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await runUpload(item, note, controller.signal);
          controllersRef.current.delete(item.localId);
          return;
        } catch (error) {
          lastError = error;

          const aborted =
            controller.signal.aborted ||
            (error instanceof DOMException && error.name === "AbortError");
          if (aborted) {
            patch(item.localId, { status: "cancelled", error: null, progress: 0 });
            controllersRef.current.delete(item.localId);
            return;
          }

          const retryable = error instanceof UploadError ? error.retryable : true;
          if (!retryable || attempt === MAX_ATTEMPTS) break;

          // Back off a little, then give the same file another go.
          await new Promise((resolve) =>
            setTimeout(resolve, 400 * 2 ** (attempt - 1)),
          );
          progressRef.current.delete(item.localId);
          speedRef.current.delete(item.localId);
          patch(item.localId, { status: "uploading", progress: 0, error: null });
        }
      }

      controllersRef.current.delete(item.localId);
      patch(item.localId, {
        status: "error",
        error: describeError(lastError),
        progress: 0,
      });
    } catch (error) {
      controllersRef.current.delete(item.localId);
      patch(item.localId, { status: "error", error: describeError(error) });
    }
  }

  async function runUpload(item: QueueItem, note: string, signal: AbortSignal) {
    // On a retry the id is reused, so the object is overwritten in place
    // instead of being uploaded a second time under a new key.
    const initResponse = await fetch("/api/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        path: item.path,
        size: item.size,
        mime: item.mime,
        kind: item.kind,
        note,
        folder: item.folder,
        reuseId: item.uploadId,
        session: item.session,
      }),
      signal,
    });
    if (!initResponse.ok) {
      throw new UploadError(
        await errorText(initResponse),
        isRetryableStatus(initResponse.status),
      );
    }

    const prepared = (await initResponse.json()) as InitResponse;
    patch(item.localId, {
      uploadId: prepared.id,
      key: prepared.key,
      session: prepared.session,
    });

    if (prepared.upload.kind === "vercel-blob") {
      // The official Blob client splits big files into parts and sends them in
      // parallel, so a slow link cannot cut a 200 MB transfer in half.
      const { upload } = await import("@vercel/blob/client");
      await upload(prepared.key, item.body, {
        access: "public",
        handleUploadUrl: prepared.upload.handleUploadUrl,
        multipart: prepared.upload.multipart,
        abortSignal: signal,
        onUploadProgress: ({ loaded, total }) => {
          if (total) reportProgress(item.localId, loaded / total);
        },
      });
    } else {
      await putWithProgress(
        prepared.upload.url,
        item.body,
        prepared.upload.headers,
        (progress) => reportProgress(item.localId, progress),
        signal,
      );
    }

    reportProgress(item.localId, 1);

    // The bytes are in the bucket at this point. The call below only attaches
    // the note, so a failure here must not turn a finished upload into a
    // failed one, and it must not hang the queue either.
    const complete = new AbortController();
    const giveUp = setTimeout(() => complete.abort(), COMPLETE_TIMEOUT_MS);
    const onAbort = () => complete.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      const completeResponse = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prepared.id,
          key: prepared.key,
          name: item.name,
          path: item.path,
          size: item.size,
          mime: item.mime,
          kind: item.kind,
          note,
          folder: item.folder,
          session: prepared.session,
        }),
        signal: complete.signal,
      });
      if (!completeResponse.ok) {
        throw new UploadError(await errorText(completeResponse));
      }
    } catch (error) {
      if (signal.aborted) throw error;
      patch(item.localId, {
        warning: `The file was uploaded, but the note was not saved (${describeError(error)}).`,
      });
    } finally {
      clearTimeout(giveUp);
      signal.removeEventListener("abort", onAbort);
    }

    patch(item.localId, {
      status: "done",
      progress: 1,
      shareUrl: `${window.location.origin}/anyupload/file/${prepared.id}`,
    });
  }

  async function startUpload() {
    const queue = itemsRef.current.filter(
      (item) => item.status === "queued" || item.status === "error",
    );
    if (queue.length === 0) return;

    setBusy(true);
    const note = batchNote.trim();
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      async () => {
        while (cursor < queue.length) {
          const item = queue[cursor++];
          await uploadOne(item, note);
        }
      },
    );
    await Promise.all(workers);
    setBusy(false);

    const failed = itemsRef.current.filter((item) => item.status === "error").length;
    const done = itemsRef.current.filter((item) => item.status === "done").length;

    if (done > 0) {
      toast.push({
        title: `${done} ${done === 1 ? "file" : "files"} uploaded`,
        tone: "success",
        description: "The links are ready to share.",
      });
    }
    if (failed > 0) {
      toast.push({
        title: `${failed} ${failed === 1 ? "file" : "files"} failed`,
        tone: "error",
        description: "Open the item to see what went wrong, then try again.",
      });
    }
  }

  // Warn before the tab goes away with an upload still running.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({ count: acc.count + 1, size: acc.size + item.size }),
        { count: 0, size: 0 },
      ),
    [items],
  );

  const pendingCount = items.filter(
    (item) => item.status === "queued" || item.status === "error",
  ).length;
  const doneCount = items.filter((item) => item.status === "done").length;
  const activeCount = items.filter((item) => item.status === "uploading").length;

  const uploadedBytes = items.reduce(
    (acc, item) => acc + item.size * item.progress,
    0,
  );
  const overall = totals.size > 0 ? Math.min(1, uploadedBytes / totals.size) : 0;

  const activeSpeed = items
    .filter((item) => item.status === "uploading")
    .reduce((acc, item) => acc + (item.speed ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Send
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Files, folders or a snippet of text. The bytes go straight from
            your browser into the bucket, so there is no size limit to work
            around.
          </p>
        </div>

        {activeCount > 0 ? (
          <div className="badge h-7 gap-2 px-2.5">
            <SpinnerIcon className="size-3.5 animate-spin text-accent" />
            {activeSpeed > 0 ? `${formatBytes(activeSpeed)}/s` : "uploading"}
          </div>
        ) : null}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setDragging(false);
          const picked = await fromDataTransfer(event.dataTransfer);
          addPicked(picked);
          if (picked.length > 0) {
            toast.push({
              title: `${picked.length} ${picked.length === 1 ? "file" : "files"} added`,
              tone: "info",
            });
          }
        }}
        className={`panel relative flex flex-col items-center justify-center gap-4 border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-border"
        }`}
      >
        <div
          className={`flex size-14 items-center justify-center rounded-2xl transition-colors ${
            dragging ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"
          }`}
        >
          <UploadIcon className="size-6" />
        </div>
        <div>
          <p className="text-base font-medium">Drop files or folders here</p>
          <p className="mt-1 text-sm text-muted">
            or pick them from your machine
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
          >
            Choose files
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="btn btn-secondary"
          >
            <FolderIcon className="size-4" />
            Choose a folder
          </button>
          <button
            type="button"
            onClick={() => setShowText((value) => !value)}
            className="btn btn-secondary"
          >
            <TextIcon className="size-4" />
            Paste text
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            addPicked(fromFileList(event.target.files));
            event.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            addPicked(fromFileList(event.target.files));
            event.target.value = "";
          }}
        />
      </div>

      {showText ? (
        <div className="panel animate-fade-up space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold">Paste some text</h2>
            <input
              value={textName}
              onChange={(event) => setTextName(event.target.value)}
              placeholder="filename.txt"
              className="input sm:w-56"
            />
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            placeholder="Type or paste anything here..."
            className="input resize-y font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowText(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addText}
              disabled={!text.trim()}
              className="btn btn-primary"
            >
              Add to queue
            </button>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <div className="text-sm font-medium">
              {totals.count} {totals.count === 1 ? "item" : "items"} ·{" "}
              <span className="text-muted">{formatBytes(totals.size)}</span>
            </div>

              <input
                value={batchNote}
                onChange={(event) => setBatchNote(event.target.value)}
                placeholder="Add a note to everything in this batch (optional)"
                className="input min-w-0 flex-1 py-1.5"
                maxLength={400}
              />

            {doneCount > 0 ? (
              <button
                type="button"
                onClick={clearFinished}
                className="btn btn-ghost px-2 py-1.5 text-xs"
              >
                Clear finished
              </button>
            ) : null}

            {busy ? (
              <button
                type="button"
                onClick={cancelAll}
                className="btn btn-danger py-1.5 text-xs"
              >
                Cancel
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void startUpload()}
              disabled={busy || pendingCount === 0}
              className="btn btn-primary"
            >
              {busy ? (
                <SpinnerIcon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              {busy ? "Uploading…" : `Upload ${pendingCount || ""}`.trim()}
            </button>
          </div>

          {busy ? (
            <div className="h-1 w-full overflow-hidden bg-surface-2">
              <div
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.round(overall * 100)}%` }}
              />
            </div>
          ) : null}

          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.localId} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
                      item.folder
                        ? "bg-surface-2 text-muted"
                        : item.kind === "text"
                          ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : fileTone(item.mime, item.name).className
                    }`}
                  >
                    {item.folder ? (
                      <FolderIcon className="size-4" />
                    ) : item.kind === "text" ? (
                      <TextIcon className="size-4" />
                    ) : (
                      <span className="text-[10px] font-semibold tracking-tight">
                        {fileTone(item.mime, item.name).label}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium">
                        {item.name}
                      </span>
                      {item.folder ? (
                        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                          {item.folder}/
                        </span>
                      ) : null}
                      <span className="text-xs text-muted">
                        {formatBytes(item.size)}
                      </span>
                    </div>

                    {item.path !== item.name ? (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        {item.path}
                      </p>
                    ) : null}

                    {item.status === "uploading" ? (
                      <div className="mt-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-150"
                            style={{
                              width: `${Math.round(item.progress * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-muted">
                          {item.progress >= 1
                            ? "Finishing up…"
                            : `${Math.round(item.progress * 100)}%${
                                item.speed ? ` · ${formatBytes(item.speed)}/s` : ""
                              }${
                                item.speed && item.speed > 0
                                  ? ` · ${formatDuration(
                                      (item.size * (1 - item.progress)) / item.speed,
                                    )} left`
                                  : ""
                              }`}
                        </p>
                      </div>
                    ) : null}

                    {item.status === "error" ? (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
                        <AlertIcon className="mt-px size-3.5 shrink-0" />
                        <span>{item.error}</span>
                      </p>
                    ) : null}

                    {item.warning ? (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                        <AlertIcon className="mt-px size-3.5 shrink-0" />
                        <span>{item.warning}</span>
                      </p>
                    ) : null}

                    {item.status === "cancelled" ? (
                      <p className="mt-1.5 text-xs text-muted">
                        Cancelled. Start the upload again to retry.
                      </p>
                    ) : null}

                    {item.status === "done" && item.shareUrl ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckIcon className="size-3.5" />
                          Uploaded
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(item.shareUrl!)
                              .then(() => {
                                setCopied(item.localId);
                                setTimeout(() => setCopied(null), 1500);
                                toast.push({
                                  title: "Link copied",
                                  tone: "success",
                                });
                              })
                              .catch(() =>
                                toast.push({
                                  title: "Could not copy the link",
                                  tone: "error",
                                }),
                              );
                          }}
                          className="inline-flex items-center gap-1 text-xs text-accent underline-offset-2 hover:underline"
                        >
                          {copied === item.localId ? (
                            <>
                              <CheckIcon className="size-3" />
                              Link copied
                            </>
                          ) : (
                            <>
                              <LinkIcon className="size-3" />
                              Copy link
                            </>
                          )}
                        </button>
                        <a
                          href={item.shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted underline-offset-2 hover:underline"
                        >
                          Open
                        </a>
                      </div>
                    ) : null}

                    {openNotes[item.localId] ? (
              <input
                value={item.note}
                onChange={(event) =>
                  patch(item.localId, { note: event.target.value })
                }
                placeholder="Note for this file (optional)"
                className="input mt-2 py-1.5"
                maxLength={400}
              />
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Add a note"
                      onClick={() =>
                        setOpenNotes((prev) => ({
                          ...prev,
                          [item.localId]: !prev[item.localId],
                        }))
                      }
                      className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <NoteIcon className="size-4" />
                    </button>
                    {item.status === "uploading" ? (
                      <button
                        type="button"
                        title="Cancel this upload"
                        onClick={() => cancel(item.localId)}
                        className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => remove(item.localId)}
                        className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

async function errorText(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function describeError(error: unknown): string {
  if (error instanceof UploadError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The upload was cancelled.";
  }
  if (error instanceof Error) {
    if (/network|failed to fetch|load failed/i.test(error.message)) {
      return "The connection dropped. Check your network and try again.";
    }
    return error.message;
  }
  return "The upload failed.";
}

/**
 * XHR instead of fetch: it is the only browser API that reports upload
 * progress, and the file never passes through the app server.
 */
function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      request.setRequestHeader(key, value);
    }

    const onAbort = () => request.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      signal.removeEventListener("abort", onAbort);
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(
          new UploadError(
            `Upload failed with status ${request.status}. If this is a fresh setup, the bucket CORS policy is the usual culprit.`,
            isRetryableStatus(request.status),
          ),
        );
      }
    };
    request.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new UploadError("Network error during upload."));
    };
    request.onabort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    };
    request.send(body);
  });
}
