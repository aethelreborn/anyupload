import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getUpload } from "@/lib/uploads";
import { isNextControlFlowError } from "@/lib/http";

/**
 * The share link. It never expires: every visit mints a fresh signed URL and
 * redirects to it, so the same URL can be pasted into a chat and used for
 * months.
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

    const url = await getStorage().createDownloadUrl(record.key, {
      inline: false,
      filename: record.name,
      origin: new URL(request.url).origin,
    });

    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[GET /anyupload/file/:id]", error);
    return new Response("Could not prepare the download.", { status: 500 });
  }
}
