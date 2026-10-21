import { getStorage } from "./storage";
import { FILE_PREFIX, MAX_NOTE_LENGTH, NOTE_PREFIX } from "./storage/keys";
import { guessMime } from "./mime";

export { guessMime };

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
  /** Root folder name for folder uploads, else null. */
  folder: string | null;
  createdAt: string;
  /** Storage key of the object. */
  key: string;
};

export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function rootFolder(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : null;
}

/**
 * Every upload is derived from a single listing of the store.
 *
 * The file name lives in the object key and the note lives in a second object
 * keyed by the same id, so one listing yields the complete picture. There is
 * no index to keep in sync, no read-modify-write race, and an upload becomes
 * visible the moment its bytes land, even if the browser never reports back.
 */
export async function listUploads(): Promise<UploadRecord[]> {
  const storage = getStorage();
  const objects = await storage.list();

  const notes = new Map<string, string>();
  const records: UploadRecord[] = [];

  for (const object of objects) {
    const note = storage.parseNoteKey(object.key);
    if (note) {
      notes.set(note.id, note.note);
      continue;
    }

    const file = storage.parseKey(object.key);
    if (!file) continue;

    const mime = guessMime(file.path);
    records.push({
      id: file.id,
      name: basename(file.path),
      path: file.path,
      size: object.size,
      mime,
      kind: mime.startsWith("text/") ? "text" : "file",
      note: "",
      folder: rootFolder(file.path),
      createdAt: object.lastModified.toISOString(),
      key: object.key,
    });
  }

  for (const record of records) {
    record.note = notes.get(record.id) ?? "";
  }

  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Looks one upload up without walking the whole bucket.
 *
 * Both objects of an upload share the same id, so two prefix listings are
 * enough. Resolving a share link therefore costs two small requests instead
 * of a full scan, which matters once the bucket holds a lot of files.
 */
export async function getUpload(id: string): Promise<UploadRecord | null> {
  if (!/^[a-z0-9]{8,64}$/i.test(id)) return null;

  const storage = getStorage();
  const [files, notes] = await Promise.all([
    storage.list(`${FILE_PREFIX}${id}/`),
    storage.list(`${NOTE_PREFIX}${id}/`),
  ]);

  const object = files[0];
  if (!object) return null;

  const file = storage.parseKey(object.key);
  if (!file) return null;

  const note = notes
    .map((entry) => storage.parseNoteKey(entry.key))
    .find((entry): entry is { id: string; note: string } => Boolean(entry));

  const mime = guessMime(file.path);

  return {
    id: file.id,
    name: basename(file.path),
    path: file.path,
    size: object.size,
    mime,
    kind: mime.startsWith("text/") ? "text" : "file",
    note: note?.note ?? "",
    folder: rootFolder(file.path),
    createdAt: object.lastModified.toISOString(),
    key: object.key,
  };
}

/**
 * Stores the note that belongs to an upload. Writing it twice is harmless, so
 * a retried upload does not create a duplicate.
 */
export async function saveNote(id: string, note: string): Promise<void> {
  const clean = note.trim().slice(0, MAX_NOTE_LENGTH);
  if (!clean) return;
  const storage = getStorage();
  await storage.put(
    storage.buildNoteKey(id, clean),
    clean,
    "text/plain;charset=utf-8",
  );
}

export async function deleteUpload(id: string): Promise<boolean> {
  const record = await getUpload(id);
  if (!record) return false;

  const storage = getStorage();
  await storage.delete(record.key);
  if (record.note) {
    await storage.delete(storage.buildNoteKey(id, record.note));
  }
  return true;
}
