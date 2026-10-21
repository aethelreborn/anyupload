import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  list,
  presignUrl,
  put,
  type IssuedSignedToken,
} from "@vercel/blob";
import {
  buildKey,
  buildNoteKey,
  parseKey,
  parseNoteKey,
} from "./keys";
import type {
  DownloadUrlOptions,
  StorageProvider,
  StoredObject,
  UploadUrl,
} from "./types";

/**
 * Vercel Blob backend.
 *
 * Needs no payment method: the Hobby plan includes 1 GB of storage, 10k
 * simple operations, 2k advanced operations and 10 GB of transfer per month.
 *
 * Uploads use a presigned PUT URL, which keeps the bytes off the serverless
 * function exactly like the R2 backend does. The URL is produced by
 * `presignUrl`, which is a local HMAC operation; only the delegation token
 * needs a network round-trip, and that one is cached.
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB, the single-part limit
const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

let cachedBase: string | null = null;
let cachedToken: { token: IssuedSignedToken; expiresAt: number } | null = null;

/** Percent-encodes each path segment so the pathname is a valid URL path. */
function encodePathname(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

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
      "BLOB_STORE_ID is not set. Connect the Blob store to the project (Vercel -> Storage -> yourupload -> Projects -> Connect to Project) or set BLOB_PUBLIC_BASE_URL.",
    );
  }

  cachedBase = `https://${storeId}.public.blob.vercel-storage.com`;
  return cachedBase;
}

/**
 * The delegation token is the only part of the presigned flow that needs a
 * network call, so it is cached until shortly before it expires.
 */
async function getPutToken(): Promise<IssuedSignedToken> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.token;
  }

  const token = await issueSignedToken({
    // A store wide wildcard so one token covers every upload.
    pathname: "*",
    operations: ["put"],
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    validUntil: Date.now() + TOKEN_LIFETIME_MS,
  });

  cachedToken = { token, expiresAt: token.validUntil };
  return token;
}

export function createBlobProvider(): StorageProvider {
  return {
    name: "blob",

    buildKey,
    parseKey,
    buildNoteKey,
    parseNoteKey,

    async createUploadUrl(
      key: string,
      _contentType: string,
    ): Promise<UploadUrl> {
      const token = await getPutToken();
      const { presignedUrl } = await presignUrl(token, {
        operation: "put",
        pathname: key,
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
      });
      // Vercel Blob derives the stored content type from the pathname
      // extension, so the client does not need to send one.
      return { url: presignedUrl, headers: {} };
    },

    async createDownloadUrl(key: string, options?: DownloadUrlOptions): Promise<string> {
      const base = storeBaseUrl();
      const url = `${base}/${encodePathname(key)}`;
      // `?download=1` switches the response from inline to attachment.
      return options?.inline ? url : `${url}?download=1`;
    },

    async downloadResponse(key: string, filename: string): Promise<Response> {
      const result = await get(key, { access: "public" });
      if (!result) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(result.stream, {
        headers: {
          "Content-Type": result.blob.contentType ?? "application/octet-stream",
          "Content-Disposition": contentDisposition(filename),
          "Cache-Control": "private, no-store",
        },
      });
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

    async list(): Promise<StoredObject[]> {
      const objects: StoredObject[] = [];
      let cursor: string | undefined;

      do {
        const result = await list({ cursor, limit: 1000 });
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

/**
 * Builds a Content-Disposition value that survives non-ASCII filenames.
 * `filename=` is a sanitised ASCII fallback, `filename*=` carries the real
 * UTF-8 name.
 */
export function contentDisposition(filename: string): string {
  const ascii =
    filename
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download";
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
