/**
 * Key encoding shared by every storage backend.
 *
 * The path is kept verbatim so the key is exactly the object pathname the
 * storage SDK expects. Percent-encoding it here would break reads: the SDK
 * encodes a pathname once when it builds the URL, and a pre-encoded key
 * would be decoded back to the unencoded name and no longer match.
 *
 * The note is base64url encoded because it is free-form text and has to fit
 * in a single key segment.
 */

export const FILE_PREFIX = "f/";
export const NOTE_PREFIX = "n/";

/** Longest note that is stored in a key. */
export const MAX_NOTE_LENGTH = 400;

/** Removes empty segments and traversal from a user supplied path. */
export function sanitisePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

export function encodeNote(note: string): string {
  return Buffer.from(note, "utf8").toString("base64url");
}

export function decodeNote(encoded: string): string {
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

export function buildKey(id: string, path: string): string {
  return `${FILE_PREFIX}${id}/${sanitisePath(path) || "file"}`;
}

export function parseKey(key: string): { id: string; path: string } | null {
  if (!key.startsWith(FILE_PREFIX)) return null;
  const rest = key.slice(FILE_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const id = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (!id || !path) return null;
  return { id, path };
}

export function buildNoteKey(id: string, note: string): string {
  return `${NOTE_PREFIX}${id}/${encodeNote(note)}`;
}

export function parseNoteKey(key: string): { id: string; note: string } | null {
  if (!key.startsWith(NOTE_PREFIX)) return null;
  const rest = key.slice(NOTE_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const id = rest.slice(0, slash);
  const note = decodeNote(rest.slice(slash + 1));
  if (!id) return null;
  return { id, note };
}
