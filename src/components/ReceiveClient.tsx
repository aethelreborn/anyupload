"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadZip } from "client-zip";
import {
  ArchiveIcon,
  DownloadIcon,
  RefreshIcon,
  SearchIcon,
  SpinnerIcon,
} from "@/components/Icons";
import { EmptyIcon, UploadCard, type UploadItem } from "@/components/UploadCard";

const ADMIN_KEY_STORAGE = "anyupload.adminKey";

type UploadsPayload = { uploads: UploadItem[]; storage: string };

async function fetchUploads(): Promise<UploadsPayload> {
  const response = await fetch("/api/uploads", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load uploads (${response.status})`);
  }
  return (await response.json()) as UploadsPayload;
}

export function ReceiveClient() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [storage, setStorage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((data: UploadsPayload) => {
    setUploads(data.uploads);
    setStorage(data.storage);
    setError(null);
    setSelected((prev) => {
      const available = new Set(data.uploads.map((upload) => upload.id));
      return new Set([...prev].filter((id) => available.has(id)));
    });
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await fetchUploads());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load uploads.");
    } finally {
      setLoading(false);
    }
  }, [apply]);

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return uploads;
    return uploads.filter((upload) =>
      `${upload.name} ${upload.path} ${upload.note}`.toLowerCase().includes(needle),
    );
  }, [uploads, query]);

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
      setNotice("That admin key was not accepted.");
      return;
    }
    if (!response.ok) {
      setNotice("Could not delete the upload.");
      return;
    }

    localStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setNotice(`Deleted "${upload.name}".`);
    await load();
  }

  async function downloadAsZip(items: UploadItem[], label: string) {
    if (items.length === 0) return;
    setZipping(true);
    setNotice(null);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: items.map((item) => item.id) }),
      });
      if (!response.ok) throw new Error("Could not prepare the download.");
      const data = (await response.json()) as { urls: Record<string, string> };

      const used = new Map<string, number>();
      const blob = await downloadZip(zipEntries(items, data.urls, used)).blob();
      triggerDownload(blob, `anyupload-${label}.zip`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not build the ZIP.");
    } finally {
      setZipping(false);
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));
  const selectedItems = uploads.filter((item) => selected.has(item.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Receive</h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading
              ? "Loading…"
              : `${uploads.length} ${uploads.length === 1 ? "upload" : "uploads"} available`}
            {storage === "local" ? (
              <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                local storage mode
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              className="w-44 rounded-lg border border-border bg-surface py-2 pl-8.5 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>

          <button
            type="button"
            onClick={() => void load()}
            title="Refresh"
            className="rounded-lg border border-border bg-surface p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <RefreshIcon className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => void downloadAsZip(filtered.length ? filtered : uploads, "all")}
            disabled={zipping || uploads.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            {zipping ? (
              <SpinnerIcon className="size-4 animate-spin" />
            ) : (
              <ArchiveIcon className="size-4" />
            )}
            Download all as ZIP
          </button>

          {selectedItems.length > 0 ? (
            <button
              type="button"
              onClick={() => void downloadAsZip(selectedItems, "selected")}
              disabled={zipping}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-opacity disabled:opacity-40"
            >
              <DownloadIcon className="size-4" />
              {selectedItems.length} selected
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-muted hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="flex items-center gap-3 text-xs text-muted">
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

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-xs text-muted">
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
          className="shrink-0 underline-offset-2 hover:text-foreground hover:underline"
        >
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
            className="min-w-56 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
              setNotice("Admin key saved in this browser.");
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
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
