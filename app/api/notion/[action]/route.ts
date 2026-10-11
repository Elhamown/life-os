import { notionApi, errorResponse } from "../../../lib/private/api";
import { productionContext } from "../../../lib/private/context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    return await notionApi(request, action, productionContext());
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
