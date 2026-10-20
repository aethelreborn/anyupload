"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CloseIcon,
  FileIcon,
  FolderIcon,
  NoteIcon,
  SpinnerIcon,
  TextIcon,
  UploadIcon,
} from "@/components/Icons";
import { formatBytes } from "@/lib/format";
import { fromDataTransfer, fromFileList, rootFolder, type PickedFile } from "@/lib/pick";

type Status = "queued" | "uploading" | "done" | "error";

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
  error: string | null;
  shareUrl: string | null;
  /** Reused on retry so a failed upload cannot leave a duplicate behind. */
  uploadId: string | null;
  key: string | null;
};

const CONCURRENCY = 3;

export function SendClient() {
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

  // The folder picker is a non-standard attribute, so it is set imperatively.
  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  function commit(next: QueueItem[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function patch(localId: string, changes: Partial<QueueItem>) {
    commit(
      itemsRef.current.map((item) =>
        item.localId === localId ? { ...item, ...changes } : item,
      ),
    );
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
      shareUrl: null,
      uploadId: null,
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
        shareUrl: null,
        uploadId: null,
        key: null,
      },
    ]);
    setText("");
    setTextName("");
    setShowText(false);
  }

  function remove(localId: string) {
    commit(itemsRef.current.filter((item) => item.localId !== localId));
  }

  function clearFinished() {
    commit(itemsRef.current.filter((item) => item.status !== "done"));
  }

  async function uploadOne(item: QueueItem) {
    patch(item.localId, { status: "uploading", progress: 0, error: null });
    try {
      const note = item.note.trim() || batchNote.trim();

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
        }),
      });
      if (!initResponse.ok) throw new Error(await errorText(initResponse));

      const prepared = (await initResponse.json()) as {
        id: string;
        key: string;
        url: string;
        headers: Record<string, string>;
      };
      patch(item.localId, { uploadId: prepared.id, key: prepared.key });

      await putWithProgress(
        prepared.url,
        item.body,
        prepared.headers,
        (progress) => patch(item.localId, { progress }),
      );

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
        }),
      });
      if (!completeResponse.ok) throw new Error(await errorText(completeResponse));

      patch(item.localId, {
        status: "done",
        progress: 1,
        shareUrl: `${window.location.origin}/anyupload/file/${prepared.id}`,
      });
    } catch (error) {
      patch(item.localId, {
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  async function startUpload() {
    const queue = itemsRef.current.filter(
      (item) => item.status === "queued" || item.status === "error",
    );
    if (queue.length === 0) return;

    setBusy(true);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      async () => {
        while (cursor < queue.length) {
          const item = queue[cursor++];
          await uploadOne(item);
        }
      },
    );
    await Promise.all(workers);
    setBusy(false);
  }

  const totals = items.reduce(
    (acc, item) => ({ count: acc.count + 1, size: acc.size + item.size }),
    { count: 0, size: 0 },
  );
  const pendingCount = items.filter(
    (item) => item.status === "queued" || item.status === "error",
  ).length;
  const doneCount = items.filter((item) => item.status === "done").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Send</h1>
        <p className="mt-1.5 text-sm text-muted">
          Anything goes: files with no extension, whole folders, or a snippet of
          text. The bytes go straight from your browser into the bucket.
        </p>
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
          addPicked(await fromDataTransfer(event.dataTransfer));
        }}
        className={`panel relative flex flex-col items-center justify-center gap-4 border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-border"
        }`}
      >
        <div
          className={`flex size-14 items-center justify-center rounded-2xl ${
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
            className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Choose files
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            <FolderIcon className="size-4" />
            Choose a folder
          </button>
          <button
            type="button"
            onClick={() => setShowText((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:bg-surface-2"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent sm:w-56"
            />
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            placeholder="Type or paste anything here..."
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowText(false)}
              className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addText}
              disabled={!text.trim()}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-40"
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
              className="min-w-48 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
            />

            {doneCount > 0 ? (
              <button
                type="button"
                onClick={clearFinished}
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                Clear finished
              </button>
            ) : null}

            <button
              type="button"
              onClick={startUpload}
              disabled={busy || pendingCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <SpinnerIcon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              {busy ? "Uploading…" : `Upload ${pendingCount || ""}`.trim()}
            </button>
          </div>

          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.localId} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    {item.kind === "text" ? (
                      <TextIcon className="size-4" />
                    ) : item.folder ? (
                      <FolderIcon className="size-4" />
                    ) : (
                      <FileIcon className="size-4" />
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
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-150"
                          style={{ width: `${Math.round(item.progress * 100)}%` }}
                        />
                      </div>
                    ) : null}

                    {item.status === "error" ? (
                      <p className="mt-1.5 text-xs text-danger">{item.error}</p>
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
                            navigator.clipboard.writeText(item.shareUrl!);
                            setCopied(item.localId);
                            setTimeout(() => setCopied(null), 1500);
                          }}
                          className="text-xs text-accent underline-offset-2 hover:underline"
                        >
                          {copied === item.localId ? "Link copied" : "Copy link"}
                        </button>
                        <a
                          href={item.shareUrl}
                          className="text-xs text-muted underline-offset-2 hover:underline"
                        >
                          Open
                        </a>
                      </div>
                    ) : null}

                    {openNotes[item.localId] ? (
                      <input
                        autoFocus
                        value={item.note}
                        onChange={(event) =>
                          patch(item.localId, { note: event.target.value })
                        }
                        placeholder="Note for this file (optional)"
                        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
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
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <NoteIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => remove(item.localId)}
                      disabled={item.status === "uploading"}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-30"
                    >
                      <CloseIcon className="size-4" />
                    </button>
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

/**
 * XHR instead of fetch: it is the only browser API that reports upload
 * progress, and the file never passes through the app server.
 */
function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      request.setRequestHeader(key, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(
          new Error(
            `Upload failed with status ${request.status}. If this is a fresh setup, the bucket CORS policy is the usual culprit.`,
          ),
        );
      }
    };
    request.onerror = () => reject(new Error("Network error during upload."));
    request.onabort = () => reject(new Error("Upload was cancelled."));
    request.send(body);
  });
}
