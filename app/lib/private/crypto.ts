import "server-only";
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { PrivateConfig } from "./config";
export const SESSION_SECONDS = 1800;
export const cookieName = (config: PrivateConfig) =>
  config.secureCookies ? "__Host-madar-private" : "madar-private-local";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordMatches(
  password: string,
  hash: string,
): Promise<boolean> {
  if (
    Buffer.byteLength(password) > 512 ||
    !/^scrypt\$32768\$8\$1\$[a-f\d]{64}\$[a-f\d]{128}$/i.test(hash)
  )
    return false;
  const [, , , , salt, expected] = hash.split("$");
  const actual = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      Buffer.from(salt, "hex"),
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key)),
    ),
  );
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
export async function issueToken(
  config: PrivateConfig,
  id: string,
  now = Date.now(),
) {
  return new SignJWT({ ownerVersion: digest(config.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuer(config.origin)
    .setAudience("madar-private")
    .setJti(id)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_SECONDS)
    .sign(new TextEncoder().encode(config.sessionSecret));
}
export async function verifyToken(
  config: PrivateConfig,
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(config.sessionSecret),
      {
        algorithms: ["HS256"],
        issuer: config.origin,
        audience: "madar-private",
        maxTokenAge: `${SESSION_SECONDS}s`,
      },
    );
    return payload.sub === "owner" &&
      payload.ownerVersion === digest(config.passwordHash) &&
      typeof payload.jti === "string" &&
      /^[a-f\d]{64}$/i.test(payload.jti)
      ? payload.jti
      : null;
  } catch {
    return null;
  }
}
export function seal(
  value: unknown,
  key: string,
  purpose = "madar-private-v1",
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal<T>(
  value: string,
  key: string,
  purpose = "madar-private-v1",
): T {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(),
  ) as T;
}
