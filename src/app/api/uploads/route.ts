import { listUploads } from "@/lib/uploads";
import { getStorage } from "@/lib/storage";
import { fail, isNextControlFlowError, json } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const records = await listUploads();
    const storage = getStorage();
    const origin = new URL(request.url).origin;

    const uploads = await Promise.all(
      records.map(async (record) => ({
        id: record.id,
        name: record.name,
        path: record.path,
        size: record.size,
        mime: record.mime,
        kind: record.kind,
        note: record.note,
        batchId: record.batchId,
        folder: record.folder,
        createdAt: record.createdAt,
        // The stable, shareable link. It always resolves to a fresh signed URL.
        shareUrl: `/anyupload/file/${record.id}`,
        downloadUrl: await storage.createDownloadUrl(record.key, {
          inline: false,
          filename: record.name,
          origin,
        }),
        previewUrl: await storage.createDownloadUrl(record.key, {
          inline: true,
          filename: record.name,
          origin,
        }),
      })),
    );

    return json({ uploads, storage: storage.name });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[GET /api/uploads]", error);
    return fail("Could not list uploads.", 500);
  }
}
