"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeZip } from "client-zip";
import {
  ArchiveIcon,
  ChevronDownIcon,
  DownloadIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  SpinnerIcon,
} from "@/components/Icons";
import { EmptyIcon, UploadCard, type UploadItem } from "@/components/UploadCard";
import { useToast } from "@/components/Toast";
import { formatBytes } from "@/lib/format";

const ADMIN_KEY_STORAGE = "anyupload.adminKey";

type UploadsPayload = { uploads: UploadItem[]; storage: string };

type SortKey = "newest" | "oldest" | "name" | "largest" | "smallest";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name A–Z" },
  { key: "largest", label: "Largest first" },
  { key: "smallest", label: "Smallest first" },
];

async function fetchUploads(): Promise<UploadsPayload> {
  const response = await fetch("/api/uploads", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load uploads (${response.status})`);
  }
  return (await response.json()) as UploadsPayload;
}

export function ReceiveClient() {
  const toast = useToast();

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [storage, setStorage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const apply = useCallback((data: UploadsPayload) => {
    setUploads(data.uploads);
    setStorage(data.storage);
    setError(null);
    setSelected((prev) => {
      const available = new Set(data.uploads.map((upload) => upload.id));
      return new Set([...prev].filter((id) => available.has(id)));
    });
  }, []);

  const load = useCallback(
    async (mode: "initial" | "background" = "background") => {
      if (mode === "background") setRefreshing(true);
      try {
        apply(await fetchUploads());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load uploads.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    let cancelled = false;
    fetchUploads()
      .then((data) => {
        if (!cancelled) apply(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load uploads.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Pick up uploads made from another device without hammering the API.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // "/" focuses the search field, the way most file browsers do it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? uploads.filter((upload) =>
          `${upload.name} ${upload.path} ${upload.note}`.toLowerCase().includes(needle),
        )
      : [...uploads];

    switch (sort) {
      case "oldest":
        return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "largest":
        return list.sort((a, b) => b.size - a.size);
      case "smallest":
        return list.sort((a, b) => a.size - b.size);
      default:
        return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }, [uploads, query, sort]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyLink(upload: UploadItem) {
    const url = `${window.location.origin}${upload.shareUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(upload.id);
      setTimeout(() => setCopiedId(null), 1500);
      toast.push({ title: "Link copied", tone: "success" });
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function handleDelete(upload: UploadItem) {
    if (!confirm(`Delete "${upload.name}"? This cannot be undone.`)) return;

    let key = adminKey;
    if (!key) {
      const entered = window.prompt("Admin key required to delete uploads:");
      if (!entered) return;
      key = entered;
    }

    const response = await fetch(`/api/uploads/${upload.id}`, {
      method: "DELETE",
      headers: { "x-admin-key": key },
    });

    if (response.status === 401) {
      setShowAdmin(true);
      setAdminKey(key);
      toast.push({
        title: "That admin key was not accepted",
        tone: "error",
        description: "Check ADMIN_KEY in the environment and try again.",
      });
      return;
    }
    if (!response.ok) {
      toast.push({ title: "Could not delete the upload", tone: "error" });
      return;
    }

    localStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    toast.push({ title: `Deleted "${upload.name}"`, tone: "success" });
    await load();
  }

  async function downloadAsZip(items: UploadItem[], label: string) {
    if (items.length === 0) return;
    setZipping(true);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: items.map((item) => item.id) }),
      });
      if (!response.ok) throw new Error("Could not prepare the download.");
      const data = (await response.json()) as { urls: Record<string, string> };

      const used = new Map<string, number>();
      const filename = `anyupload-${label}.zip`;
      const stream = makeZip(zipEntries(items, data.urls, used));

      // Stream the archive to disk when the browser allows it, so a large
      // bundle never has to fit in memory.
      const writer = await openFileWriter(filename);
      if (writer.kind === "writer") {
        await stream.pipeTo(writer.writable);
        toast.push({
          title: `Saved ${filename}`,
          tone: "success",
          description: `${items.length} ${items.length === 1 ? "file" : "files"} zipped.`,
        });
      } else if (writer.kind === "cancelled") {
        // The user closed the save dialog.
      } else {
        const blob = await new Response(stream).blob();
        triggerDownload(blob, filename);
      }
    } catch (err) {
      toast.push({
        title: "Could not build the ZIP",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setZipping(false);
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));
  const selectedItems = uploads.filter((item) => selected.has(item.id));
  const totalSize = uploads.reduce((acc, item) => acc + item.size, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Receive
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>
              {loading
                ? "Loading…"
                : `${uploads.length} ${uploads.length === 1 ? "upload" : "uploads"}`}
            </span>
            {uploads.length > 0 ? (
              <span aria-hidden="true">·</span>
            ) : null}
            {uploads.length > 0 ? <span>{formatBytes(totalSize)}</span> : null}
            {storage ? (
              <span className="badge" title="Storage backend in use">
                {storage === "local" ? "local storage mode" : `${storage} storage`}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              aria-label="Search uploads"
              className="input w-44 py-2 pl-8.5"
            />
          </div>

          <div className="relative">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Sort uploads"
              className="input appearance-none py-2 pl-3 pr-8"
            >
              {SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          </div>

          <button
            type="button"
            onClick={() => void load()}
            title="Refresh"
            aria-label="Refresh"
            className="btn btn-secondary p-2"
          >
            <RefreshIcon
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={() => void downloadAsZip(filtered.length ? filtered : uploads, "all")}
            disabled={zipping || uploads.length === 0}
            className="btn btn-secondary"
          >
            {zipping ? (
              <SpinnerIcon className="size-4 animate-spin" />
            ) : (
              <ArchiveIcon className="size-4" />
            )}
            Download all as ZIP
          </button>
        </div>
      </div>

      {error ? (
        <div className="panel flex items-center justify-between gap-3 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load("initial")}
            className="btn btn-ghost px-2 py-1 text-xs"
          >
            Try again
          </button>
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(
                  allSelected ? new Set() : new Set(filtered.map((item) => item.id)),
                )
              }
              className="size-3.5 accent-[var(--accent)]"
            />
            Select all
          </label>

          {selectedItems.length > 0 ? (
            <div className="flex items-center gap-2">
              <span>
                {selectedItems.length}{" "}
                {selectedItems.length === 1 ? "file" : "files"} selected
              </span>
              <button
                type="button"
                onClick={() => void downloadAsZip(selectedItems, "selected")}
                disabled={zipping}
                className="btn btn-primary py-1.5 text-xs"
              >
                <DownloadIcon className="size-3.5" />
                Download selected
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="btn btn-ghost px-2 py-1.5 text-xs"
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="panel shimmer relative h-72 overflow-hidden" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="text-muted">
            <EmptyIcon />
          </span>
          <div>
            <p className="font-medium">
              {uploads.length === 0 ? "Nothing here yet" : "No matches"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {uploads.length === 0
                ? "Send something from the Send page and it will show up here."
                : "Try a different search term."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((upload) => (
            <UploadCard
              key={upload.id}
              upload={upload}
              selected={selected.has(upload.id)}
              onToggle={toggle}
              onCopy={copyLink}
              onDelete={handleDelete}
              copied={copiedId === upload.id}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 text-xs text-muted">
        <p>
          Every card has its own permanent link. Pass it to whoever needs the
          file.
        </p>
        <button
          type="button"
          onClick={() => {
            // Read the saved key from the click handler rather than an effect.
            if (!showAdmin) {
              setAdminKey(localStorage.getItem(ADMIN_KEY_STORAGE) ?? "");
            }
            setShowAdmin((value) => !value);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 underline-offset-2 hover:text-foreground hover:underline"
        >
          <ShieldIcon className="size-3.5" />
          {showAdmin ? "Hide admin key" : "Admin key"}
        </button>
      </div>

      {showAdmin ? (
        <div className="panel flex flex-wrap items-center gap-3 p-4">
          <label htmlFor="admin-key" className="text-sm font-medium">
            Admin key
          </label>
          <input
            id="admin-key"
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="Set ADMIN_KEY in the environment to enable deleting"
            className="input min-w-56 flex-1"
          />
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
              toast.push({
                title: "Admin key saved in this browser",
                tone: "success",
              });
            }}
            className="btn btn-secondary"
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Feeds the ZIP writer one file at a time.
 *
 * `client-zip` only accepts a real `Response` as an input: a URL string would
 * be zipped as literal text and a Promise would throw. It also needs the
 * size up front, otherwise it cannot write the entry header. The generator
 * means each file is only fetched once the writer asks for it, so a hundred
 * files do not mean a hundred open connections.
 */
async function* zipEntries(
  items: UploadItem[],
  urls: Record<string, string>,
  used: Map<string, number>,
) {
  for (const item of items) {
    const url = urls[item.id];
    if (!url) continue;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not fetch "${item.name}" (${response.status}).`);
    }

    yield {
      name: uniqueEntryName(item.path, used),
      input: response,
      size: item.size,
      lastModified: new Date(item.createdAt),
    };
  }
}

function uniqueEntryName(path: string, used: Map<string, number>): string {
  const name = path.replace(/^\/+/, "") || "file";
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);
  if (count === 0) return name;

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (${count + 1})`;
  return `${name.slice(0, dot)} (${count + 1})${name.slice(dot)}`;
}

type FileWriter =
  | { kind: "none" }
  | { kind: "cancelled" }
  | { kind: "writer"; writable: WritableStream<Uint8Array> };

/**
 * Asks the browser for a place to write the archive.
 *
 * Chrome and Edge support the File System Access API, which lets the ZIP be
 * streamed straight to disk. Everywhere else the archive has to be buffered
 * in memory first.
 */
async function openFileWriter(filename: string): Promise<FileWriter> {
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<{
        createWritable: () => Promise<WritableStream<Uint8Array>>;
      }>;
    }
  ).showSaveFilePicker;

  if (typeof picker !== "function") return { kind: "none" };

  try {
    const handle = await picker({
      suggestedName: filename,
      types: [
        { description: "ZIP archive", accept: { "application/zip": [".zip"] } },
      ],
    });
    const writable = await handle.createWritable();
    return { kind: "writer", writable };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "cancelled" };
    }
    return { kind: "none" };
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
