import { deleteUpload } from "@/lib/uploads";
import { fail, isAdminRequest, isNextControlFlowError, json } from "@/lib/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminRequest(request)) {
    return fail("Invalid admin key.", 401);
  }

  const { id } = await params;
  try {
    const deleted = await deleteUpload(id);
    if (!deleted) return fail("Upload not found.", 404);
    return json({ ok: true });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[DELETE /api/uploads/:id]", error);
    return fail("Could not delete the upload.", 500);
  }
}
