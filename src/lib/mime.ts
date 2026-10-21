const MIME_BY_EXTENSION: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  js: "text/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  py: "text/x-python",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  csv: "text/csv",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  sh: "text/plain",
  log: "text/plain",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
};

/** Best guess at the media type of a path, based on its extension. */
export function guessMime(path: string): string {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "application/octet-stream";
  const extension = name.slice(dot + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}
