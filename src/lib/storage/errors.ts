/**
 * Error helpers shared by the storage backends.
 *
 * The AWS SDK reports HTTP conditions with a status code and a name, the
 * Vercel Blob SDK reports them as a plain `Error` with the reason in the
 * message, so both shapes are normalised here.
 */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  const name = (error as { name?: string })?.name;
  if (status === 404) return true;
  if (name === "NoSuchKey" || name === "NotFound" || name === "BlobNotFoundError") {
    return true;
  }
  const message = messageOf(error).toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
}

export function isPreconditionFailed(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  const name = (error as { name?: string })?.name;
  if (status === 412 || status === 409) return true;
  if (
    name === "PreconditionFailed" ||
    name === "ConditionalRequestConflict" ||
    name === "BlobPreconditionFailedError"
  ) {
    return true;
  }
  const message = messageOf(error).toLowerCase();
  return (
    message.includes("precondition failed") ||
    message.includes("etag mismatch") ||
    message.includes("condition not met")
  );
}
