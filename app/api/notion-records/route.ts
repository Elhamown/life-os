import { recordsApi } from "../../lib/notion/records";
import { productionContext } from "../../lib/private/context";
import { errorResponse } from "../../lib/private/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    return await recordsApi(request, productionContext());
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
