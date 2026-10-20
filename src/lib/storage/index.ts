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
 *   STORAGE_PROVIDER=r2    -> Cloudflare R2 (S3 compatible)
 *   STORAGE_PROVIDER=local -> local filesystem (development fallback)
 *
 * If R2 credentials are present we default to R2, otherwise we fall back to
 * local so the app still boots and the UI can be exercised before the bucket
 * exists.
 */
export function getStorage(): StorageProvider {
  if (provider) return provider;

  const configured = process.env.STORAGE_PROVIDER?.toLowerCase();
  const hasR2 = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );

  if (configured === "r2" && !hasR2) {
    throw new StorageConfigurationError(
      "STORAGE_PROVIDER is set to r2 but the R2 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.",
    );
  }

  if (configured === "local" || (!configured && !hasR2)) {
    // On Vercel the filesystem is read-only, so the local backend cannot
    // possibly work. Failing with a clear message beats a confusing 500.
    if (!configured && process.env.VERCEL) {
      throw new StorageConfigurationError(
        "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME in the Vercel project settings, then redeploy.",
      );
    }
    provider = createLocalProvider();
  } else {
    provider = createR2Provider();
  }

  return provider;
}

export function storageMode(): "r2" | "local" {
  return getStorage().name;
}

export * from "./types";
