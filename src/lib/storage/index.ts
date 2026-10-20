import { createLocalProvider } from "./local";
import { createR2Provider } from "./r2";
import type { StorageProvider } from "./types";

let provider: StorageProvider | null = null;

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

  if (configured === "local" || (!configured && !hasR2)) {
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
