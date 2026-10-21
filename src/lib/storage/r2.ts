import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildKey,
  buildNoteKey,
  parseKey,
  parseNoteKey,
} from "./keys";
import { isNotFound } from "./errors";
import type {
  DownloadUrlOptions,
  StorageProvider,
  StoredObject,
  UploadUrl,
} from "./types";

const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60; // S3/R2 hard ceiling is 7 days.

export function buildR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  const missing = Object.entries({
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET_NAME: bucket,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing R2 configuration: ${missing.join(", ")}. See .env.example for the full setup.`,
    );
  }

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
  };
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const { accountId, accessKeyId, secretAccessKey } = buildR2Config();

  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // Without this the SDK appends `x-amz-checksum-crc32` to presigned PUTs,
    // which the browser cannot reproduce, so every upload fails the signature check.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return client;
}

function clampExpiry(seconds?: number): number {
  if (!seconds) return MAX_PRESIGN_SECONDS;
  return Math.min(Math.max(1, Math.floor(seconds)), MAX_PRESIGN_SECONDS);
}

/**
 * Builds a Content-Disposition value that survives non-ASCII filenames.
 * `filename=` is a sanitised ASCII fallback, `filename*=` carries the real UTF-8 name.
 */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii =
    filename
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download";
  const encoded = encodeURIComponent(filename);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function r2DownloadUrl(
  key: string,
  options?: DownloadUrlOptions,
): Promise<string> {
  const { bucket } = buildR2Config();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: contentDisposition(
      options?.filename ?? key.split("/").pop() ?? "download",
      options?.inline ?? false,
    ),
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: clampExpiry(options?.expiresIn),
  });
}

export function createR2Provider(): StorageProvider {
  return {
    name: "r2",

    buildKey,
    parseKey,
    buildNoteKey,
    parseNoteKey,

    async createUploadUrl(
      key: string,
      contentType: string,
    ): Promise<UploadUrl> {
      const { bucket } = buildR2Config();
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(getClient(), command, {
        expiresIn: clampExpiry(6 * 60 * 60),
      });
      return { url, headers: { "Content-Type": contentType } };
    },

    async createDownloadUrl(key: string, options?: DownloadUrlOptions): Promise<string> {
      return r2DownloadUrl(key, options);
    },

    async downloadResponse(
      key: string,
      filename: string,
    ): Promise<Response> {
      const url = await r2DownloadUrl(key, { inline: false, filename });
      return Response.redirect(url, 302);
    },

    async put(key, body, contentType) {
      const { bucket } = buildR2Config();
      await getClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async get(key) {
      const { bucket } = buildR2Config();
      try {
        const result = await getClient().send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        return (await result.Body?.transformToString()) ?? null;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async head(key) {
      const { bucket } = buildR2Config();
      try {
        const result = await getClient().send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          size: result.ContentLength ?? 0,
          lastModified: result.LastModified ?? new Date(0),
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async delete(key) {
      const { bucket } = buildR2Config();
      await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async list(): Promise<StoredObject[]> {
      const { bucket } = buildR2Config();
      const objects: StoredObject[] = [];
      let continuationToken: string | undefined;

      do {
        const result = await getClient().send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
          }),
        );
        for (const item of result.Contents ?? []) {
          if (!item.Key) continue;
          objects.push({
            key: item.Key,
            size: item.Size ?? 0,
            lastModified: item.LastModified ?? new Date(0),
          });
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (continuationToken);

      return objects;
    },
  };
}

export { isNotFound, isPreconditionFailed } from "./errors";
