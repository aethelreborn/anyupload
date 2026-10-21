export type StoredObject = {
  key: string;
  size: number;
  lastModified: Date;
};

export type UploadUrl = {
  /** URL the browser sends the raw bytes to. */
  url: string;
  /** Headers the browser MUST send verbatim, or the signature will not match. */
  headers: Record<string, string>;
};

export type DownloadUrlOptions = {
  /** When true the browser renders the file inline instead of downloading it. */
  inline?: boolean;
  /** Seconds the signed URL stays valid. */
  expiresIn?: number;
  /** Name the browser should save the file as. */
  filename?: string;
  /** Origin the URL should point back to. Only used by same-origin backends. */
  origin?: string;
};

/**
 * A storage backend.
 *
 * There is no separate metadata index: every piece of information about an
 * upload is encoded in its object key, so a single listing is the whole
 * index. That keeps the two backends behaviourally identical, removes the
 * read-modify-write race entirely, and means an upload is visible the moment
 * its bytes land, even if the browser never reports back.
 *
 * Key layout:
 *   f/<id>/<percent-encoded-original-path>   the file itself
 *   n/<id>/<base64url-note>                   the note attached to it
 */
export interface StorageProvider {
  readonly name: "r2" | "blob" | "local";

  /** Builds the object key for a file. */
  buildKey(id: string, path: string): string;

  /** Splits a file key back into its id and original path. */
  parseKey(key: string): { id: string; path: string } | null;

  /** Builds the object key for the note attached to an upload. */
  buildNoteKey(id: string, note: string): string;

  /** Splits a note key back into its id and note. */
  parseNoteKey(key: string): { id: string; note: string } | null;

  /**
   * Signed URL the browser can PUT raw bytes to, bypassing the function body
   * limit.
   */
  createUploadUrl(
    key: string,
    contentType: string,
    origin?: string,
  ): Promise<UploadUrl>;

  /** Signed URL the browser can GET the file from. */
  createDownloadUrl(key: string, options?: DownloadUrlOptions): Promise<string>;

  /**
   * Serves the file for download with the given filename. Implementations may
   * redirect to a signed URL or stream the bytes.
   */
  downloadResponse(
    key: string,
    filename: string,
    origin?: string,
  ): Promise<Response>;

  /** Server-side write. */
  put(key: string, body: string, contentType: string): Promise<void>;

  /** Server-side read. Returns null when the key does not exist. */
  get(key: string): Promise<string | null>;

  /** Server-side metadata lookup. Returns null when the key does not exist. */
  head(key: string): Promise<{ size: number; lastModified: Date } | null>;

  /** Server-side delete. No-op when the key does not exist. */
  delete(key: string): Promise<void>;

  /** Server-side list of every object in the store. */
  list(): Promise<StoredObject[]>;
}
