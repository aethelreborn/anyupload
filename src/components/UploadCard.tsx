"use client";

import { useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  TrashIcon,
} from "@/components/Icons";
import { TextPreview } from "@/components/TextPreview";
import { formatBytes, formatRelative } from "@/lib/format";

export type UploadItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  mime: string;
  kind: "file" | "text";
  note: string;
  batchId: string | null;
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

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "FILE";
  return name.slice(dot + 1).slice(0, 5).toUpperCase();
}

export function UploadCard({ upload, selected, onToggle, onCopy, onDelete, copied }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const isImage = upload.mime.startsWith("image/") && upload.mime !== "image/svg+xml";
  const isVideo = upload.mime.startsWith("video/");
  const isText =
    upload.kind === "text" ||
    upload.mime.startsWith("text/") ||
    upload.mime === "application/json" ||
    upload.mime === "application/xml";

  return (
    <article
      className={`panel card-hover flex flex-col overflow-hidden ${
        selected ? "border-accent" : ""
      }`}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-surface-2">
        {isImage && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={upload.previewUrl}
            alt={upload.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="size-full object-cover"
          />
        ) : isVideo ? (
          <video
            src={upload.previewUrl}
            controls
            preload="metadata"
            className="size-full bg-black object-contain"
          />
        ) : isText ? (
          <TextPreview url={upload.previewUrl} name={upload.name} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
            <FileIcon className="size-8" />
            <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-[11px]">
              {extensionOf(upload.name)}
            </span>
          </div>
        )}

        <label className="absolute left-2.5 top-2.5 flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(upload.id)}
            className="size-4 cursor-pointer accent-[var(--accent)]"
            aria-label={`Select ${upload.name}`}
          />
        </label>

        {upload.folder ? (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {upload.folder}/
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={upload.name}>
            {upload.name}
          </p>
          {upload.path !== upload.name ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted" title={upload.path}>
              {upload.path}
            </p>
          ) : null}
        </div>

        {upload.note ? (
          <p className="rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs text-foreground/90">
            {upload.note}
          </p>
        ) : null}

        <p className="text-xs text-muted">
          {formatBytes(upload.size)} · {formatRelative(upload.createdAt)}
        </p>

        <div className="mt-auto flex items-center gap-1 pt-1">
          <a
            href={upload.downloadUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg no-underline transition-opacity hover:opacity-90"
          >
            <DownloadIcon className="size-3.5" />
            Download
          </a>
          <button
            type="button"
            onClick={() => onCopy(upload)}
            title="Copy share link"
            className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDelete(upload)}
            title="Delete"
            className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <TrashIcon className="size-3.5" />
          </button>
        </div>
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
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
