import { aiApi, withAi } from "../../../lib/ai/api";
import { productionContext } from "../../../lib/private/context";
import { errorResponse } from "../../../lib/private/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    return await aiApi(
      request,
      (await params).action,
      withAi(productionContext()),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
