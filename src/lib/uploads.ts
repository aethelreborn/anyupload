import { getStorage } from "./storage";
import { isPreconditionFailed } from "./storage/r2";

export type UploadKind = "file" | "text";

export type UploadRecord = {
  /** Short, unguessable id used in share links. */
  id: string;
  /** Display name (basename of `path`). */
  name: string;
  /** Original relative path. Folder uploads keep their structure here. */
  path: string;
  size: number;
  mime: string;
  kind: UploadKind;
  /** Free-form note the sender attached. */
  note: string;
  /** Groups every file that came from a single folder drop. */
  batchId: string | null;
  /** Root folder name for folder uploads, else null. */
  folder: string | null;
  createdAt: string;
  /** Storage key of the object. */
  key: string;
};

export const FILES_PREFIX = "f/";
export const INDEX_KEY = "meta/index.json";

export function buildKey(id: string, path: string): string {
  return `${FILES_PREFIX}${id}/${encodeURIComponent(path)}`;
}

export function parseKey(key: string): { id: string; path: string } | null {
  if (!key.startsWith(FILES_PREFIX)) return null;
  const rest = key.slice(FILES_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const id = rest.slice(0, slash);
  const encoded = rest.slice(slash + 1);
  if (!id || !encoded) return null;
  let path: string;
  try {
    path = decodeURIComponent(encoded);
  } catch {
    path = encoded;
  }
  return { id, path };
}

export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readIndex(): Promise<{ records: UploadRecord[]; etag?: string }> {
  const storage = getStorage();
  const result = await storage.get(INDEX_KEY);
  if (!result) return { records: [] };
  try {
    const parsed = JSON.parse(result.body);
    const records = Array.isArray(parsed) ? (parsed as UploadRecord[]) : [];
    return { records, etag: result.etag };
  } catch {
    // A corrupt index must not take the site down: rebuild it from the objects.
    return { records: [], etag: result.etag };
  }
}

async function writeIndex(records: UploadRecord[], etag?: string): Promise<void> {
  const storage = getStorage();
  const body = JSON.stringify(records, null, 2);
  await storage.put(
    INDEX_KEY,
    body,
    "application/json",
    etag ? { ifMatch: etag } : { ifNoneMatch: "*" },
  );
}

/**
 * Read-modify-write with an optimistic lock. R2 evaluates `If-Match`
 * atomically, so two concurrent writers can never clobber each other; the
 * loser retries against the fresh index.
 */
async function mutateIndex<T>(
  mutate: (records: UploadRecord[]) => { records: UploadRecord[]; result: T },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 6; attempt++) {
    const { records, etag } = await readIndex();
    const { records: next, result } = mutate(records);
    try {
      await writeIndex(next, etag);
      return result;
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
      lastError = error;
      await sleep(40 * 2 ** attempt);
    }
  }

  throw new Error(
    `Could not update the upload index after several attempts: ${String(lastError)}`,
  );
}

function sortNewestFirst(records: UploadRecord[]): UploadRecord[] {
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listUploads(): Promise<UploadRecord[]> {
  const storage = getStorage();
  const objects = await storage.list(FILES_PREFIX);
  const { records, etag } = await readIndex();

  const byId = new Map(records.map((record) => [record.id, record] as const));
  const seen = new Set<string>();
  const merged: UploadRecord[] = [];
  let changed = false;

  for (const object of objects) {
    const parsed = parseKey(object.key);
    if (!parsed) continue;
    seen.add(parsed.id);

    const existing = byId.get(parsed.id);
    if (existing) {
      if (existing.size !== object.size) changed = true;
      merged.push({ ...existing, size: object.size, key: object.key });
    } else {
      // The object exists in the bucket but was never indexed (for example the
      // browser closed right after the upload finished). Recover it so nothing
      // is ever invisible.
      changed = true;
      merged.push({
        id: parsed.id,
        name: basename(parsed.path),
        path: parsed.path,
        size: object.size,
        mime: guessMime(parsed.path),
        kind: "file",
        note: "",
        batchId: null,
        folder: null,
        createdAt: object.lastModified.toISOString(),
        key: object.key,
      });
    }
  }

  // Drop index entries whose object is gone (deleted outside the app).
  for (const record of records) {
    if (!seen.has(record.id)) changed = true;
  }

  const result = sortNewestFirst(merged);

  if (changed) {
    try {
      await writeIndex(result, etag);
    } catch (error) {
      // The index is a cache; the bucket is the source of truth. A failed
      // rewrite must not break the page.
      if (!isPreconditionFailed(error)) throw error;
    }
  }

  return result;
}

export async function getUpload(id: string): Promise<UploadRecord | null> {
  const records = await listUploads();
  return records.find((record) => record.id === id) ?? null;
}

export async function addUploads(
  incoming: Omit<UploadRecord, "key" | "createdAt">[],
): Promise<UploadRecord[]> {
  return mutateIndex((records) => {
    const byId = new Map(records.map((record) => [record.id, record] as const));
    const added: UploadRecord[] = [];

    for (const item of incoming) {
      const record: UploadRecord = {
        ...item,
        key: buildKey(item.id, item.path),
        createdAt: new Date().toISOString(),
      };
      byId.set(record.id, record);
      added.push(record);
    }

    return { records: sortNewestFirst([...byId.values()]), result: added };
  });
}

export async function removeUpload(id: string): Promise<boolean> {
  return mutateIndex((records) => {
    const next = records.filter((record) => record.id !== id);
    return { records: next, result: next.length !== records.length };
  });
}

export async function deleteUpload(id: string): Promise<boolean> {
  const record = await getUpload(id);
  if (!record) return false;

  const storage = getStorage();
  await storage.delete(record.key);
  await removeUpload(id);
  return true;
}

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

export function guessMime(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "application/octet-stream";
  const extension = name.slice(dot + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function isPreviewableImage(mime: string): boolean {
  return mime.startsWith("image/") && mime !== "image/svg+xml";
}

export function isPreviewableVideo(mime: string): boolean {
  return mime.startsWith("video/");
}

export function isPreviewableText(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/x-yaml"
  );
}
