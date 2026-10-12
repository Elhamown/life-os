// Local, offline setup only. No network, environment credentials or application imports.
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, chmod, writeFile, realpath, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, isAbsolute, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const messages = {
  TERMINAL_REQUIRED:
    "Use a private interactive terminal without arguments, pipes or redirection.",
  PLATFORM_UNSUPPORTED: "Use macOS/Linux or a private local WSL terminal.",
  TERMINAL_IO: "Terminal input or raw mode is unavailable.",
  INPUT_EOF: "Terminal input ended before completion.",
  INPUT_CANCELLED: "Cancelled. No values printed.",
  INPUT_CONTROL:
    "Unsupported control sequence. Use normal typing or single-line paste; edit with Backspace.",
  INPUT_MULTILINE:
    "Paste contains a line break. Copy only the single-line password, then press Enter.",
  PASSWORD_POLICY: "Use 16–128 UTF-16 units and at most 512 UTF-8 bytes.",
  PASSWORD_TOO_LONG: "Input exceeded 128 UTF-16 units or 512 UTF-8 bytes.",
  PASSWORD_MISMATCH:
    "Confirmation differs from the first entry. Retry locally; no values printed.",
  OUTPUT_LOCATION:
    "Cannot resolve your private home directory or script location.",
  OUTPUT_IN_REPOSITORY:
    "Private output must be outside the repository. Keep the checkout below Projects, not at your home root.",
  OUTPUT_WRITE:
    "Cannot create private output. Check free disk space and home directory write permissions.",
  CRYPTO_FAILED: "Local cryptographic operation failed.",
  SETUP_FAILED:
    "Unexpected local setup failure. No error details or values printed.",
};
export class SetupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function safeSetupError(error) {
  const code =
    error instanceof SetupError && Object.hasOwn(messages, error.code)
      ? error.code
      : "SETUP_FAILED";
  return `Setup stopped [${code}]. ${messages[code]} No secret values printed.\n`;
}

export function assertOutsideRepository(home, repository) {
  const path = relative(repository, home);
  if (
    !path ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  )
    throw new SetupError("OUTPUT_IN_REPOSITORY");
}
export function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 16 ||
    password.length > 128 ||
    Buffer.byteLength(password) > 512
  )
    throw new SetupError("PASSWORD_POLICY");
}
export function createSecretValues(password, entropy = randomBytes) {
  validatePassword(password);
  try {
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
  } catch {
    throw new SetupError("CRYPTO_FAILED");
  }
}

// One raw-mode session across all prompts: no echo window, no discarded chunk suffix,
// no split CRLF interpreted as an empty confirmation. Node's decoder retains split UTF-8.
export class HiddenTerminal {
  /**
   * @param {import("node:stream").Readable & { isTTY?: boolean, isRaw?: boolean, setRawMode: (raw: boolean) => unknown }} [input]
   * @param {import("node:stream").Writable & { isTTY?: boolean }} [output]
   */
  constructor(input = process.stdin, output = process.stderr) {
    if (!input.isTTY || !output.isTTY)
      throw new SetupError("TERMINAL_REQUIRED");
    this.input = input;
    this.output = output;
    this.wasRaw = !!input.isRaw;
    this.buffer = "";
    this.value = "";
    this.escape = "";
    this.paste = false;
    this.ignoreLF = false;
    this.active = null;
    this.failure = null;
    this.closed = false;
    this.onData = (chunk) => {
      this.buffer += chunk;
      if (Buffer.byteLength(this.buffer) > 8192) {
        this.fail(new SetupError("PASSWORD_TOO_LONG"));
        return;
      }
      try {
        this.drain();
      } catch {
        this.fail(new SetupError("TERMINAL_IO"));
      }
    };
    this.onEnd = () => this.fail(new SetupError("INPUT_EOF"));
    this.onError = () => this.fail(new SetupError("TERMINAL_IO"));
    try {
      input.setEncoding("utf8");
      input.setRawMode(true);
      input.on("data", this.onData);
      input.on("end", this.onEnd);
      input.on("error", this.onError);
      output.on("error", this.onError);
      // macOS Terminal supports bracketed paste; delimiters are never password data.
      output.write("\x1b[?2004h");
      input.resume();
    } catch {
      this.close();
      throw new SetupError("TERMINAL_IO");
    }
  }
  read(prompt) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closed || this.active)
      return Promise.reject(new SetupError("TERMINAL_IO"));
    return new Promise((resolve, reject) => {
      this.active = { resolve, reject };
      this.value = "";
      try {
        this.output.write(prompt);
        this.drain();
      } catch {
        this.fail(new SetupError("TERMINAL_IO"));
      }
    });
  }
  fail(error) {
    this.failure = error;
    this.buffer = this.value = this.escape = "";
    const active = this.active;
    this.active = null;
    active?.reject(error);
  }
  drain() {
    while (this.active && this.buffer.length) {
      const char = String.fromCodePoint(this.buffer.codePointAt(0));
      this.buffer = this.buffer.slice(char.length);
      if (this.ignoreLF) {
        this.ignoreLF = false;
        if (char === "\n") continue;
      }
      if (char === "\u0003") {
        this.fail(new SetupError("INPUT_CANCELLED"));
        return;
      }
      if (this.escape || char === "\x1b") {
        this.escape += char;
        if (this.escape === "\x1b[200~" && !this.paste) {
          this.paste = true;
          this.escape = "";
        } else if (this.escape === "\x1b[201~" && this.paste) {
          this.paste = false;
          this.escape = "";
        } else if (
          !"\x1b[200~".startsWith(this.escape) &&
          !"\x1b[201~".startsWith(this.escape)
        ) {
          this.fail(new SetupError("INPUT_CONTROL"));
          return;
        }
        continue;
      }
      if (this.paste && (char === "\r" || char === "\n")) {
        this.fail(new SetupError("INPUT_MULTILINE"));
        return;
      }
      if (!this.paste && (char === "\r" || char === "\n")) {
        this.ignoreLF = char === "\r";
        const value = this.value,
          active = this.active;
        this.active = null;
        this.value = "";
        this.output.write("\n");
        active.resolve(value);
        continue;
      }
      if (!this.paste && (char === "\u007f" || char === "\b"))
        this.value = Array.from(this.value).slice(0, -1).join("");
      else if (char.charCodeAt(0) < 32 || char === "\u007f") {
        this.fail(new SetupError("INPUT_CONTROL"));
        return;
      } else this.value += char;
      if (this.value.length > 128 || Buffer.byteLength(this.value) > 512) {
        this.fail(new SetupError("PASSWORD_TOO_LONG"));
        return;
      }
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.input.removeListener("data", this.onData);
    this.input.removeListener("end", this.onEnd);
    this.input.removeListener("error", this.onError);
    this.output.removeListener("error", this.onError);
    this.input.pause();
    try {
      this.input.setRawMode(this.wasRaw);
    } catch {
      /* Never print raw terminal exceptions. */
    }
    try {
      this.output.write("\x1b[?2004l");
    } catch {
      /* Never print raw terminal exceptions. */
    }
    if (this.active) this.fail(new SetupError("INPUT_CANCELLED"));
    this.buffer = this.value = this.escape = "";
  }
}

export async function readConfirmedPassword(terminal) {
  let password = await terminal.read(
    "Choose owner password (hidden, 16–128 characters): ",
  );
  // Diagnose a too-short first entry before asking for confirmation.
  validatePassword(password);
  let confirmation = await terminal.read("Confirm password (hidden): ");
  if (password !== confirmation) {
    password = confirmation = "";
    throw new SetupError("PASSWORD_MISMATCH");
  }
  confirmation = "";
  return password;
}

export async function writePrivateOutput(home, repository, values) {
  let directory;
  try {
    // Re-resolve to reject symlinked homes leading inside the checkout.
    const resolvedHome = await realpath(home),
      resolvedRepository = await realpath(repository);
    assertOutsideRepository(resolvedHome, resolvedRepository);
    directory = await mkdtemp(join(resolvedHome, ".madar-owner-secrets-"));
    await chmod(directory, 0o700);
    for (const name of [
      "MADAR_OWNER_PASSWORD_HASH",
      "MADAR_SESSION_SECRET",
      "MADAR_STORE_ENCRYPTION_KEY",
    ])
      await writeFile(join(directory, name), values[name], {
        mode: 0o600,
        flag: "wx",
      });
    return directory;
  } catch (error) {
    // Remove only this invocation's newly created partial output; never existing files.
    if (directory)
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    if (error instanceof SetupError) throw error;
    throw new SetupError("OUTPUT_WRITE");
  }
}

async function main() {
  if (process.platform === "win32")
    throw new SetupError("PLATFORM_UNSUPPORTED");
  if (
    !process.stdin.isTTY ||
    !process.stderr.isTTY ||
    !process.stdout.isTTY ||
    process.argv.length !== 2
  )
    throw new SetupError("TERMINAL_REQUIRED");
  let home, repository;
  try {
    home = await realpath(homedir());
    repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
  } catch {
    throw new SetupError("OUTPUT_LOCATION");
  }
  assertOutsideRepository(home, repository);
  process.umask(0o077);
  const terminal = new HiddenTerminal();
  const onSignal = () => {
    terminal.close();
    process.exitCode = 130;
  };
  // Ctrl+C in raw mode is handled as input; SIGTERM restores terminal state too.
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  try {
    let password = await readConfirmedPassword(terminal);
    terminal.close();
    const values = createSecretValues(password);
    password = "";
    const directory = await writePrivateOutput(home, repository, values);
    process.stdout.write(
      `Private files created in: ${directory}\nNo secret values were printed.\n`,
    );
  } finally {
    terminal.close();
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(safeSetupError(error));
    process.exitCode = 1;
  });
}
