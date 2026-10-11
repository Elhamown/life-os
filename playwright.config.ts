import { SignJWT } from "jose";
import { defineConfig } from "@playwright/test";
const token = await new SignJWT({})
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
