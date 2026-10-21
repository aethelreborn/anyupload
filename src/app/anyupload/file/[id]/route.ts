import { getStorage } from "@/lib/storage";
import { getUpload } from "@/lib/uploads";
import { isNextControlFlowError } from "@/lib/http";

/**
 * The share link. It never expires: every visit resolves the upload and
 * serves it under its original filename.
 *
 * R2 redirects to a freshly signed URL, Vercel Blob streams the bytes so the
 * Content-Disposition can carry the exact name.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const record = await getUpload(id);
    if (!record) {
      return new Response("This upload no longer exists.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const storage = getStorage();
    return await storage.downloadResponse(
      record.key,
      record.name,
      new URL(request.url).origin,
    );
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[GET /anyupload/file/:id]", error);
    return new Response("Could not prepare the download.", { status: 500 });
  }
}
