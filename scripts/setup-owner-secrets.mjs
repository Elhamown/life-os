// Local, offline setup only. No network, environment credentials or application imports.
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, chmod, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function createSecretValues(password, entropy = randomBytes) {
  if (
    typeof password !== "string" ||
    password.length < 16 ||
    password.length > 128 ||
    Buffer.byteLength(password) > 512
  )
    throw new Error("Use 16–128 characters, at most 512 UTF-8 bytes.");
  const salt = entropy(32);
  const hash = scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return {
    MADAR_OWNER_PASSWORD_HASH: `scrypt$32768$8$1$${salt.toString("hex")}$${hash.toString("hex")}`,
    MADAR_SESSION_SECRET: entropy(32).toString("hex"),
    MADAR_STORE_ENCRYPTION_KEY: entropy(32).toString("hex"),
  };
}

function hiddenInput(prompt) {
  process.stderr.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          finish(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u007f" || char === "\b")
          value = Array.from(value).slice(0, -1).join("");
        else if (char.charCodeAt(0) < 32) {
          finish(new Error("Unsupported input."));
          return;
        } else value += char;
        if (value.length > 128 || Buffer.byteLength(value) > 512) {
          finish(new Error("Password too long."));
          return;
        }
      }
    };
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

async function main() {
  // Unix permissions are not a Windows ACL guarantee: fail closed there.
  if (process.platform === "win32")
    throw new Error(
      "Use a private local WSL terminal and its Linux home directory.",
    );
  if (
    !process.stdin.isTTY ||
    !process.stderr.isTTY ||
    !process.stdout.isTTY ||
    process.argv.length !== 2
  )
    throw new Error(
      "Use a private interactive terminal, without arguments, pipes or redirection.",
    );
  process.umask(0o077);
  let password = await hiddenInput(
    "Choose owner password (hidden, 16–128 characters): ",
  );
  let confirmation = await hiddenInput("Confirm password (hidden): ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const values = createSecretValues(password);
  password = confirmation = "";
  const directory = await mkdtemp(join(homedir(), ".madar-owner-secrets-"));
  await chmod(directory, 0o700);
  for (const [name, value] of Object.entries(values))
    await writeFile(join(directory, name), value, { mode: 0o600, flag: "wx" });
  process.stdout.write(
    `Private files created in: ${directory}\nNo secret values were printed.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stderr.write(
      "Setup stopped. Check interactive terminal, matching password length and private home directory access. No values printed.\n",
    );
    process.exitCode = 1;
  });
}
