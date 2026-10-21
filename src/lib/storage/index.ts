import { createBlobProvider } from "./blob";
import { createLocalProvider } from "./local";
import { createR2Provider } from "./r2";
import type { StorageProvider } from "./types";

let provider: StorageProvider | null = null;

/** Raised when the storage backend is not usable. The message is safe to show. */
export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

/**
 * Picks the storage backend from the environment:
 *   STORAGE_PROVIDER=blob   -> Vercel Blob (no payment method needed)
 *   STORAGE_PROVIDER=r2     -> Cloudflare R2
 *   STORAGE_PROVIDER=local  -> local filesystem (development fallback)
 *
 * When it is unset the app auto-detects: Blob if a Blob store is connected,
 * otherwise R2 if R2 credentials are present, otherwise the local filesystem
 * so the app still boots before any storage is set up.
 */
export function getStorage(): StorageProvider {
  if (provider) return provider;

  const configured = process.env.STORAGE_PROVIDER?.toLowerCase();
  const hasBlob = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
  const hasR2 = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );

  if (configured === "blob" && !hasBlob) {
    throw new StorageConfigurationError(
      "STORAGE_PROVIDER is set to blob but no Blob store is connected. Set BLOB_READ_WRITE_TOKEN (and BLOB_STORE_ID), or run `vercel blob create-store anyupload --access public --yes`.",
    );
  }

  if (configured === "r2" && !hasR2) {
    throw new StorageConfigurationError(
      "STORAGE_PROVIDER is set to r2 but the R2 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.",
    );
  }

  if (configured === "local") {
    provider = createLocalProvider();
  } else if (configured === "r2") {
    provider = createR2Provider();
  } else if (configured === "blob") {
    provider = createBlobProvider();
  } else if (hasBlob) {
    provider = createBlobProvider();
  } else if (hasR2) {
    provider = createR2Provider();
  } else {
    // On Vercel the filesystem is read-only, so the local backend cannot
    // possibly work. Failing with a clear message beats a confusing 500.
    if (process.env.VERCEL) {
      throw new StorageConfigurationError(
        "No storage backend is configured. Connect a Vercel Blob store (`vercel blob create-store anyupload --access public --yes`) or set the R2 credentials, then redeploy.",
      );
    }
    provider = createLocalProvider();
  }

  return provider;
}

export function storageMode(): "r2" | "blob" | "local" {
  return getStorage().name;
}

export * from "./types";
