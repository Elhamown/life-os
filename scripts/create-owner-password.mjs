import { randomBytes, scryptSync } from "node:crypto";
// Generate locally in a trusted terminal. Never pass a password as a CLI argument or chat message.
if (!process.stdin.isTTY)
  throw new Error(
    "Run in an interactive terminal. Password input must not be logged.",
  );
process.stdout.write(
  "New private owner password (at least 16 characters; input hidden): ",
);
process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.resume();
let password = "";
process.stdin.on("data", (input) => {
  if (input.includes("\u0003")) {
    process.stdin.setRawMode(false);
    process.exit(1);
  }
  if (input.includes("\r") || input.includes("\n")) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    if (
      password.length < 16 ||
      password.length > 128 ||
      Buffer.byteLength(password) > 512
    ) {
      console.error("\nUse 16–128 characters (maximum 512 bytes).");
      process.exitCode = 1;
      return;
    }
    const salt = randomBytes(32);
    const hash = scryptSync(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    password = "";
    console.log(
      `\nMADAR_OWNER_PASSWORD_HASH=scrypt$32768$8$1$${salt.toString("hex")}$${hash.toString("hex")}`,
    );
  } else if (input === "\u007f" || input === "\b")
    password = password.slice(0, -1);
  else password += input;
});
