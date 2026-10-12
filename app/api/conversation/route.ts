import { productionContext } from "../../lib/private/context";
import { errorResponse } from "../../lib/private/api";
import { withAi } from "../../lib/ai/api";
import { conversationApi } from "../../lib/ai/conversation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    return await conversationApi(request, withAi(productionContext()));
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
