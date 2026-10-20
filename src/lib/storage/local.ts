import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DownloadUrlOptions,
  StorageProvider,
  StoredObject,
  UploadUrl,
} from "./types";

/**
 * Filesystem-backed provider used for local development when no R2 credentials
 * are configured. It mirrors the R2 provider's contract (signed browser-facing
 * URLs) so the client code path is identical in both modes.
 */

const STORAGE_ROOT = path.join(process.cwd(), ".storage");
const MAX_SIGNATURE_SECONDS = 7 * 24 * 60 * 60;

function secret(): string {
  return process.env.ADMIN_KEY || "anyupload-local-dev-secret";
}

function sign(key: string, expires: number): string {
  return createHmac("sha256", secret()).update(`${key}|${expires}`).digest("hex");
}

export function verifyLocalSignature(
  key: string,
  expires: number,
  signature: string,
): boolean {
  if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
  const expected = sign(key, expires);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function resolveKey(key: string): string {
  // Reject any key that escapes the storage root.
  const resolved = path.resolve(STORAGE_ROOT, key);
  const root = path.resolve(STORAGE_ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

function baseUrl(origin?: string): string {
  if (origin) return origin.replace(/\/$/, "");
  return process.env.LOCAL_SITE_URL || "http://localhost:3000";
}

export function createLocalProvider(): StorageProvider {
  return {
    name: "local",

    async createUploadUrl(
      key: string,
      contentType: string,
      origin?: string,
    ): Promise<UploadUrl> {
      const expires = Math.floor(Date.now() / 1000) + 6 * 60 * 60;
      const url = `${baseUrl(origin)}/api/local/upload?key=${encodeURIComponent(key)}&exp=${expires}&sig=${sign(key, expires)}`;
      return { url, headers: { "Content-Type": contentType } };
    },

    async createDownloadUrl(key: string, options?: DownloadUrlOptions): Promise<string> {
      const expires = Math.floor(Date.now() / 1000) + (options?.expiresIn ?? MAX_SIGNATURE_SECONDS);
      const name = options?.filename ?? key.split("/").pop() ?? "download";
      const disposition = options?.inline ? "inline" : "attachment";
      return `${baseUrl(options?.origin)}/api/local/download?key=${encodeURIComponent(key)}&exp=${expires}&sig=${sign(key, expires)}&name=${encodeURIComponent(name)}&disposition=${disposition}`;
    },

    async put(key, body, _contentType, options) {
      const filePath = resolveKey(key);
      if (options?.ifMatch) {
        const existing = await readLocalObject(key);
        if (!existing || existing.etag !== options.ifMatch) {
          const error = new Error("Precondition failed") as Error & {
            $metadata?: { httpStatusCode: number };
          };
          error.$metadata = { httpStatusCode: 412 };
          throw error;
        }
      }
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      return { etag: await etagOf(filePath) };
    },

    async get(key) {
      return readLocalObject(key);
    },

    async head(key) {
      const filePath = resolveKey(key);
      try {
        const info = await stat(filePath);
        return { size: info.size, etag: await etagOf(filePath), lastModified: info.mtime };
      } catch {
        return null;
      }
    },

    async delete(key) {
      const filePath = resolveKey(key);
      await rm(filePath, { force: true });
    },

    async list(prefix: string): Promise<StoredObject[]> {
      const root = path.resolve(STORAGE_ROOT);
      const objects: StoredObject[] = [];

      async function walk(dir: string): Promise<void> {
        let entries: string[];
        try {
          entries = await readdir(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          const full = path.join(dir, entry);
          const info = await stat(full);
          if (info.isDirectory()) {
            await walk(full);
          } else {
            const key = path.relative(root, full).split(path.sep).join("/");
            objects.push({ key, size: info.size, lastModified: info.mtime });
          }
        }
      }

      await walk(resolveKey(prefix === "" ? "" : prefix.split("/")[0] || ""));
      return objects.filter((object) => object.key.startsWith(prefix));
    },
  };
}

async function etagOf(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return `"${createHmac("sha256", "local").update(content).digest("hex")}"`;
}

async function readLocalObject(
  key: string,
): Promise<{ body: string; etag?: string } | null> {
  const filePath = resolveKey(key);
  try {
    const body = await readFile(filePath, "utf8");
    return { body, etag: await etagOf(filePath) };
  } catch {
    return null;
  }
}
