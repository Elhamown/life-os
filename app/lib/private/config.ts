import "server-only";
import { PrivateError } from "./errors";
export type PrivateConfig = {
  origin: string;
  passwordHash: string;
  sessionSecret: string;
  encryptionKey: string;
  databaseUrl: string;
  notionToken: string | null;
  readOnlyAcknowledged: boolean;
  secureCookies: boolean;
};
export function getConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PrivateConfig {
  const origin = env.MADAR_APP_ORIGIN;
  if (
    !origin ||
    !env.MADAR_OWNER_PASSWORD_HASH ||
    !env.MADAR_SESSION_SECRET ||
    !env.MADAR_STORE_ENCRYPTION_KEY ||
    !env.DATABASE_URL
  )
    throw new PrivateError("PRIVATE_SETUP_REQUIRED", 503);
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new PrivateError("PRIVATE_SETUP_REQUIRED", 503);
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (!local && url.protocol !== "https:") ||
    (env.NODE_ENV === "production" && url.protocol !== "https:" && !local) ||
    env.MADAR_SESSION_SECRET.length < 64 ||
    !/^[a-f\d]{64}$/i.test(env.MADAR_STORE_ENCRYPTION_KEY) ||
    !/^scrypt\$32768\$8\$1\$[a-f\d]{64}\$[a-f\d]{128}$/i.test(
      env.MADAR_OWNER_PASSWORD_HASH,
    )
  )
    throw new PrivateError("PRIVATE_SETUP_REQUIRED", 503);
  return {
    origin,
    passwordHash: env.MADAR_OWNER_PASSWORD_HASH,
    sessionSecret: env.MADAR_SESSION_SECRET,
    encryptionKey: env.MADAR_STORE_ENCRYPTION_KEY,
    databaseUrl: env.DATABASE_URL,
    notionToken: env.NOTION_DISCOVERY_TOKEN || null,
    readOnlyAcknowledged: env.NOTION_DISCOVERY_READ_ONLY_ACK === "1",
    secureCookies: url.protocol === "https:",
  };
}
export function assertOrigin(request: Request, config: PrivateConfig) {
  if (
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new PrivateError("ORIGIN_DENIED", 403);
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new PrivateError("INVALID_REQUEST", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new PrivateError("INVALID_REQUEST", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new PrivateError("REQUEST_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body as Record<string, unknown>;
  } catch {
    throw new PrivateError("INVALID_REQUEST", 400);
  }
}
