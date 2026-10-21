export type FileTone = {
  /** Short label shown on the card, e.g. "IMG" or "PDF". */
  label: string;
  /** Tailwind classes for the badge. */
  className: string;
};

const TONES: Record<string, FileTone> = {
  image: {
    label: "IMG",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  video: {
    label: "VID",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  audio: {
    label: "AUD",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  text: {
    label: "TXT",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  code: {
    label: "SRC",
    className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  archive: {
    label: "ZIP",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  pdf: {
    label: "PDF",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  sheet: {
    label: "DOC",
    className: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
};

const CODE_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "go", "rs", "java", "c", "h",
  "cpp", "rb", "php", "sh", "yml", "yaml", "toml", "sql", "html", "css", "vue",
  "svelte",
]);

const SHEET_EXTENSIONS = new Set([
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "rtf",
]);

const ARCHIVE_MIMES = new Set([
  "application/zip",
  "application/gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Picks a colour and a short label for a file, so the same file always looks
 * the same on the send page and on the receive page.
 */
export function fileTone(mime: string, name: string): FileTone {
  const type = mime.toLowerCase();
  const extension = extensionOf(name);

  if (type.startsWith("image/")) return TONES.image;
  if (type.startsWith("video/")) return TONES.video;
  if (type.startsWith("audio/")) return TONES.audio;
  if (type === "application/pdf") return TONES.pdf;
  if (type.startsWith("text/") || type === "application/json") return TONES.text;
  if (CODE_EXTENSIONS.has(extension)) return TONES.code;
  if (SHEET_EXTENSIONS.has(extension)) return TONES.sheet;
  if (ARCHIVE_MIMES.has(type)) return TONES.archive;

  return {
    label: extension ? extension.slice(0, 4).toUpperCase() : "FILE",
    className: "bg-surface-3 text-muted",
  };
}
