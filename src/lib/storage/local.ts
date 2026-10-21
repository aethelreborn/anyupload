import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
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
 * Filesystem-backed provider used for local development when no cloud storage
 * is configured. It mirrors the cloud providers' contract (signed
 * browser-facing URLs) so the client code path is identical in every mode.
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

async function localDownloadUrl(
  key: string,
  options?: DownloadUrlOptions,
): Promise<string> {
  const expires =
    Math.floor(Date.now() / 1000) + (options?.expiresIn ?? MAX_SIGNATURE_SECONDS);
  const name = options?.filename ?? key.split("/").pop() ?? "download";
  const disposition = options?.inline ? "inline" : "attachment";
  return `${baseUrl(options?.origin)}/api/local/download?key=${encodeURIComponent(key)}&exp=${expires}&sig=${sign(key, expires)}&name=${encodeURIComponent(name)}&disposition=${disposition}`;
}

export function createLocalProvider(): StorageProvider {
  return {
    name: "local",

    buildKey,
    parseKey,
    buildNoteKey,
    parseNoteKey,

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
      return localDownloadUrl(key, options);
    },

    async downloadResponse(
      key: string,
      filename: string,
      origin?: string,
    ): Promise<Response> {
      const url = await localDownloadUrl(key, {
        inline: false,
        filename,
        origin,
      });
      return Response.redirect(url, 302);
    },

    async put(key, body) {
      const filePath = resolveKey(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body, "utf8");
    },

    async get(key) {
      try {
        return await readFile(resolveKey(key), "utf8");
      } catch {
        return null;
      }
    },

    async head(key) {
      try {
        const info = await stat(resolveKey(key));
        return { size: info.size, lastModified: info.mtime };
      } catch {
        return null;
      }
    },

    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },

    async list(): Promise<StoredObject[]> {
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

      await walk(root);
      return objects;
    },
  };
}
