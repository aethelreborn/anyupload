import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The secret used to sign short lived upload sessions.
 *
 * It has to be stable across serverless instances, so it is derived from the
 * environment rather than generated at runtime.
 */
function secret(): string {
  return (
    process.env.ADMIN_KEY ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    "anyupload-local-dev-secret"
  );
}

/**
 * Signs an upload id.
 *
 * The id of an upload is what the object key is built from, so it doubles as
 * the write permission for that object. Handing out a signed session lets a
 * retried upload write to the same id without giving anybody else the right
 * to overwrite somebody else's file.
 */
export function signUploadSession(id: string): string {
  return createHmac("sha256", secret()).update(`upload:${id}`).digest("hex");
}

/** Checks a session against the id it was issued for. */
export function verifyUploadSession(id: string, session: string): boolean {
  if (!id || !session) return false;
  const expected = Buffer.from(signUploadSession(id), "utf8");
  const provided = Buffer.from(session, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
