import { handleUpload } from "@vercel/blob/client";
import { getStorage } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/blob";
import {
  configurationErrorMessage,
  fail,
  isNextControlFlowError,
  json,
} from "@/lib/http";

/**
 * Mints the short lived client token the browser uploads with.
 *
 * The official Blob client asks this route for a token, and the token is
 * scoped to exactly one object key. That keeps the write permission narrow:
 * the browser can put bytes at `f/<id>/<name>` and nowhere else.
 */

const TOKEN_LIFETIME_MS = 60 * 60 * 1000;

/** Only file objects may be written from the browser. */
function isWritablePathname(pathname: string): boolean {
  if (!pathname.startsWith("f/")) return false;
  const rest = pathname.slice(2);
  const slash = rest.indexOf("/");
  if (slash <= 0) return false;
  const id = rest.slice(0, slash);
  return /^[a-z0-9]{8,64}$/i.test(id) && rest.length > slash + 1;
}

export async function POST(request: Request) {
  try {
    const storage = getStorage();
    if (storage.name !== "blob") {
      return fail("This backend does not use Vercel Blob client tokens.", 404);
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return fail(
        "BLOB_READ_WRITE_TOKEN is not set, so no upload token can be minted.",
        503,
      );
    }

    const body = (await request.json()) as {
      type?: string;
      payload?: { pathname?: string };
    };

    const result = await handleUpload({
      body: body as Parameters<typeof handleUpload>[0]["body"],
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isWritablePathname(pathname)) {
          throw new Error("Invalid upload path.");
        }
        return {
          validUntil: Date.now() + TOKEN_LIFETIME_MS,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          // A retried upload reuses its id, so it has to be able to replace
          // the object it wrote last time.
          allowOverwrite: true,
        };
      },
    });

    return json(result);
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[POST /api/upload/blob-token]", error);
    const config = configurationErrorMessage(error);
    return fail(
      config ?? "Could not authorise the upload.",
      config ? 503 : 400,
    );
  }
}
