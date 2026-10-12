import "server-only";
import { assertOrigin, readJson } from "./private/config";
import {
  requirePrivateSession,
  response,
  errorResponse,
  type PrivateContext,
} from "./private/api";
import { PrivateError } from "./private/errors";
import { newWorkspace, validWorkspace } from "./workspace-schema";
export async function workspaceApi(request: Request, context: PrivateContext) {
  try {
    await requirePrivateSession(request, context);
    if (!context.store.readWorkspace || !context.store.saveWorkspace)
      throw new PrivateError("WORKSPACE_SETUP_REQUIRED", 503);
    if (request.method === "GET") {
      const saved = await context.store.readWorkspace();
      if (saved && !validWorkspace(saved.data))
        throw new PrivateError("WORKSPACE_SCHEMA_UNSUPPORTED", 409);
      return response({
        revision: saved?.revision ?? 0,
        workspace: saved?.data ?? newWorkspace(),
      });
    }
    if (request.method !== "POST")
      throw new PrivateError("METHOD_NOT_ALLOWED", 405);
    assertOrigin(request, context.config);
    if (!(await context.store.consume("workspace-save", 120, 60)))
      throw new PrivateError("WORKSPACE_RATE_LIMITED", 429, 60);
    const body = await readJson(request);
    if (
      Object.keys(body).some((k) => !["revision", "workspace"].includes(k)) ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0 ||
      !validWorkspace(body.workspace)
    )
      throw new PrivateError("INVALID_REQUEST", 400);
    if (
      !(await context.store.saveWorkspace(
        body.revision as number,
        body.workspace,
      ))
    )
      throw new PrivateError("WORKSPACE_CONFLICT", 409);
    return response({ revision: (body.revision as number) + 1 });
  } catch (error) {
    return errorResponse(error);
  }
}
