import {
  BlobNotFoundError,
  del,
  get,
  head,
  list,
  put,
} from "@vercel/blob";
import {
  buildKey,
  buildNoteKey,
  parseKey,
  parseNoteKey,
} from "./keys";
import type {
  BrowserUpload,
  DownloadUrlOptions,
  StorageProvider,
  StoredObject,
} from "./types";

/**
 * Vercel Blob backend.
 *
 * Needs no payment method: the Hobby plan includes 1 GB of storage, 10k
 * simple operations, 2k advanced operations and 10 GB of transfer per month.
 *
 * Uploads go through the official Blob browser client, which is handed a
 * short-lived client token by `/api/upload/blob-token`. The bytes never touch
 * the app server, and anything above the multipart threshold is split into
 * parts that travel in parallel, so the transfer survives a slow link.
 */

/** Hard ceiling of a single upload. Vercel Blob itself allows up to 5 TB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Files above this size are uploaded as parts. A single request has to stay
 * alive for the whole transfer, so the slower the link the more likely it is
 * to be cut off halfway; parts are small, retried on their own and sent in
 * parallel.
 */
export const MULTIPART_THRESHOLD_BYTES = 16 * 1024 * 1024;

/** Route that mints the client token the browser uploads with. */
export const CLIENT_TOKEN_ROUTE = "/api/upload/blob-token";

/** Percent-encodes each path segment so the pathname is a valid URL path. */
function encodePathname(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

let cachedBase: string | null = null;

function storeBaseUrl(): string {
  if (cachedBase) return cachedBase;

  const explicit = process.env.BLOB_PUBLIC_BASE_URL;
  if (explicit) {
    cachedBase = explicit.replace(/\/+$/, "");
    return cachedBase;
  }

  const storeId = process.env.BLOB_STORE_ID?.replace(/^store_/, "").toLowerCase();
  if (!storeId) {
    throw new Error(
      "BLOB_STORE_ID is not set. Connect the Blob store to the project (Vercel -> Storage -> anyupload -> Projects -> Connect to Project) or set BLOB_PUBLIC_BASE_URL.",
    );
  }

  cachedBase = `https://${storeId}.public.blob.vercel-storage.com`;
  return cachedBase;
}

export function createBlobProvider(): StorageProvider {
  return {
    name: "blob",

    buildKey,
    parseKey,
    buildNoteKey,
    parseNoteKey,

    async createBrowserUpload(
      key: string,
      _contentType: string,
      options: { size: number },
    ): Promise<BrowserUpload> {
      return {
        kind: "vercel-blob",
        handleUploadUrl: CLIENT_TOKEN_ROUTE,
        multipart: options.size >= MULTIPART_THRESHOLD_BYTES,
      };
    },

    async createDownloadUrl(key: string, options?: DownloadUrlOptions): Promise<string> {
      const base = storeBaseUrl();
      const url = `${base}/${encodePathname(key)}`;
      // `?download=1` switches the response from inline to attachment.
      return options?.inline ? url : `${url}?download=1`;
    },

    async downloadResponse(key: string, _filename: string): Promise<Response> {
      // Redirect instead of streaming. The bytes come straight off the Blob
      // CDN, which keeps multi hundred megabyte downloads off the function
      // and makes them resumable.
      const base = storeBaseUrl();
      const url = `${base}/${encodePathname(key)}?download=1`;
      return Response.redirect(url, 302);
    },

    async put(key, body, contentType) {
      await put(key, body, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    },

    async get(key) {
      const result = await get(key, { access: "public" });
      if (!result) return null;
      return new Response(result.stream).text();
    },

    async head(key) {
      try {
        const result = await head(key);
        return { size: result.size, lastModified: result.uploadedAt };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },

    async delete(key) {
      await del(key);
    },

    async list(prefix?: string): Promise<StoredObject[]> {
      const objects: StoredObject[] = [];
      let cursor: string | undefined;

      do {
        const result = await list({ cursor, limit: 1000, prefix });
        for (const blob of result.blobs) {
          objects.push({
            key: blob.pathname,
            size: blob.size,
            lastModified: blob.uploadedAt,
          });
        }
        cursor = result.hasMore ? result.cursor : undefined;
      } while (cursor);

      return objects;
    },
  };
}
