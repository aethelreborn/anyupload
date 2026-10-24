import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The secret used to sign short lived upload sessions.
 *
 * It has to be stable across serverless instances, so it is derived from the
 * environment rather than generated at runtime.
 */
function secret(): string {
  const secret = process.env.UPLOAD_SESSION_SECRET;
  if (secret && secret.length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UPLOAD_SESSION_SECRET is not configured. Set UPLOAD_SESSION_SECRET in the environment.",
    );
  }
  return "anyupload-local-dev-secret";
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
