import { SignJWT } from "jose";
import { createHash, scryptSync } from "node:crypto";
import { defineConfig } from "@playwright/test";
const salt = Buffer.alloc(32, 5);
const fixtureHash = `scrypt$32768$8$1$${salt.toString("hex")}$${scryptSync("fixture-owner-password", salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const token = await new SignJWT({
  ownerVersion: createHash("sha256").update(fixtureHash).digest("hex"),
})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("owner")
  .setIssuer("http://localhost:3100")
  .setAudience("madar-private")
  .setJti("d".repeat(64))
  .setIssuedAt()
  .setExpirationTime("30m")
  .sign(new TextEncoder().encode("a".repeat(64)));
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1, // PGlite protocol fixture is deliberately serialized, never production auth bypass.
  use: {
    storageState: {
      cookies: [
        {
          name: "madar-private-local",
          value: token,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 1800,
          httpOnly: true,
          secure: false,
          sameSite: "Strict",
        },
      ],
      origins: [],
    },
    baseURL: "http://localhost:3100",
    headless: true,
    launchOptions: {
      executablePath: process.env.MADAR_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: "node scripts/browser-test-server.mjs",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
  },
  reporter: "list",
});
