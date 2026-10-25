"use client";

import { useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  TrashIcon,
} from "@/components/Icons";
import { fileTone } from "@/lib/filetype";
import { formatBytes, formatRelative } from "@/lib/format";

export type UploadItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  mime: string;
  kind: "file" | "text";
  note: string;
  folder: string | null;
  createdAt: string;
  shareUrl: string;
  downloadUrl: string;
  previewUrl: string;
};

type Props = {
  upload: UploadItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onCopy: (upload: UploadItem) => void;
  onDelete: (upload: UploadItem) => void;
  copied: boolean;
};

/** Decoding a very large image in a list row can take the tab down. */
const MAX_THUMBNAIL_BYTES = 20 * 1024 * 1024;

export function UploadCard({
  upload,
  selected,
  onToggle,
  onCopy,
  onDelete,
  copied,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showThumbnail =
    upload.mime.startsWith("image/") &&
    upload.mime !== "image/svg+xml" &&
    upload.size <= MAX_THUMBNAIL_BYTES &&
    !imageFailed;

  const tone = fileTone(upload.mime, upload.name);

  const actions = (
    <div className="flex items-center">
      <a
        href={upload.shareUrl}
        title={`Download ${upload.name}`}
        aria-label={`Download ${upload.name}`}
        className="icon-btn"
      >
        <DownloadIcon className="size-4" />
      </a>
      <button
        type="button"
        onClick={() => onCopy(upload)}
        title="Copy share link"
        aria-label={`Copy share link for ${upload.name}`}
        className="icon-btn"
      >
        {copied ? (
          <CheckIcon className="size-4 text-success" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onDelete(upload)}
        title="Delete upload"
        aria-label={`Delete ${upload.name}`}
        className="icon-btn hover:text-danger"
      >
        <TrashIcon className="size-4" />
      </button>
    </div>
  );

  return (
    <article
      className={`transition-colors ${
        selected ? "bg-accent-soft/45" : "hover:bg-surface-2/35"
      }`}
    >
      <div className="flex items-start gap-3 px-3 py-3 md:grid md:grid-cols-[44px_40px_minmax(0,1fr)_88px_112px_132px] md:items-center md:gap-3 md:px-4">
        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(upload.id)}
            aria-label={`Select ${upload.name}`}
            className="size-4 cursor-pointer accent-[var(--accent)]"
          />
        </label>

        <div className="file-tile hidden overflow-hidden p-0 text-muted md:flex">
          {showThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={upload.previewUrl}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <span>{tone.label}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="truncate text-sm font-semibold"
              title={upload.name}
            >
              {upload.name}
            </span>
            {upload.folder ? (
              <span className="border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {upload.folder}/
              </span>
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted md:hidden">
              {formatBytes(upload.size)} · {formatRelative(upload.createdAt)}
            </span>
          </div>

          {upload.path !== upload.name ? (
            <p
              className="mt-0.5 truncate font-mono text-[11px] text-muted"
              title={upload.path}
            >
              {upload.path}
            </p>
          ) : null}

          {upload.note ? (
            <p className="mt-1.5 border-l-2 border-signal/60 pl-2 text-xs leading-5 text-muted">
              {upload.note}
            </p>
          ) : null}

          <div className="mt-1.5 md:hidden">{actions}</div>
        </div>

        <span className="hidden text-right font-mono text-[11px] text-muted md:block">
          {formatBytes(upload.size)}
        </span>
        <span className="hidden text-right font-mono text-[11px] text-muted md:block">
          {formatRelative(upload.createdAt)}
        </span>

        <div className="hidden md:block">{actions}</div>
      </div>
    </article>
  );
}

export function EmptyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-10" aria-hidden="true">
      <path
        d="M3.5 15.5h4l1.5 3h6l1.5-3h4M4.2 15.5 6.7 8.4A1.5 1.5 0 0 1 8.1 7.4h7.8a1.5 1.5 0 0 1 1.4 1l2.5 7.1v3a1.5 1.5 0 0 1-1.5 1.5H5.7a1.5 1.5 0 0 1-1.5-1.5v-3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
