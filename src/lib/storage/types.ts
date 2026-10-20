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

export interface StorageProvider {
  readonly name: "r2" | "local";

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

  /** Server-side write. */
  put(
    key: string,
    body: string | Uint8Array,
    contentType: string,
    options?: { ifMatch?: string; ifNoneMatch?: string },
  ): Promise<{ etag?: string }>;

  /** Server-side read. Returns null when the key does not exist. */
  get(key: string): Promise<{ body: string; etag?: string } | null>;

  /** Server-side metadata lookup. Returns null when the key does not exist. */
  head(key: string): Promise<{ size: number; etag?: string; lastModified: Date } | null>;

  /** Server-side delete. No-op when the key does not exist. */
  delete(key: string): Promise<void>;

  /** Server-side list of every object under a prefix. */
  list(prefix: string): Promise<StoredObject[]>;
}
