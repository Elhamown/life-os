import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import {
  mkdtemp,
  mkdir,
  stat,
  readdir,
  readFile,
  symlink,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  HiddenTerminal,
  readConfirmedPassword,
  safeSetupError,
  SetupError,
  writePrivateOutput,
} from "../scripts/setup-owner-secrets.mjs";

class TerminalStream extends PassThrough {
  isTTY = true;
  isRaw = false;
  modes: boolean[] = [];
  setRawMode(raw: boolean) {
    this.isRaw = raw;
    this.modes.push(raw);
    return this;
  }
}
function fixture() {
  const input = new TerminalStream(),
    output = new TerminalStream();
  let display = "";
  output.on("data", (chunk) => {
    display += chunk.toString();
  });
  const terminal = new HiddenTerminal(input, output);
  return { input, output, terminal, display: () => display };
}
const password = "synthetic-test-password-only";
async function feed(input: TerminalStream, parts: (string | Buffer)[]) {
  for (const part of parts) {
    input.write(part);
    await setImmediate();
  }
}

test("macOS-style typed CR entry confirms without echo and keeps raw mode across prompts", async () => {
  const f = fixture();
  try {
    const pending = readConfirmedPassword(f.terminal);
    await feed(f.input, [...password, "\r", ...password, "\r"]);
    assert.equal(await pending, password);
    assert.deepEqual(f.input.modes, [true]);
    assert.equal(f.display().includes(password), false);
    assert.ok(f.display().includes("Confirm password"));
  } finally {
    f.terminal.close();
  }
  assert.deepEqual(f.input.modes, [true, false]);
});
test("split CRLF never becomes an empty confirmation", async () => {
  const f = fixture();
  try {
    const pending = readConfirmedPassword(f.terminal);
    await feed(f.input, [password + "\r", "\n", password + "\r", "\n"]);
    assert.equal(await pending, password);
  } finally {
    f.terminal.close();
  }
});
test("coalesced paste and both confirmations preserve buffered chunk suffixes", async () => {
  const f = fixture();
  try {
    const pending = readConfirmedPassword(f.terminal);
    await feed(f.input, [password + "\r\n" + password + "\r\n"]);
    assert.equal(await pending, password);
  } finally {
    f.terminal.close();
  }
});
test("macOS bracketed paste delimiters split across chunks are accepted without becoming password data", async () => {
  const f = fixture();
  try {
    const pending = readConfirmedPassword(f.terminal);
    await feed(f.input, [
      "\x1b[",
      "200~",
      password,
      "\x1b[20",
      "1~\r",
      "\x1b",
      "[200~",
      password,
      "\x1b[201~",
      "\r",
    ]);
    assert.equal(await pending, password);
    assert.equal(f.display().includes(password), false);
  } finally {
    f.terminal.close();
  }
});
test("backspace/delete edit typed Unicode including split UTF-8 without corrupting confirmation", async () => {
  const f = fixture();
  const arabic = "كلمة-اختبار-اصطناعية-فقط";
  try {
    const pending = readConfirmedPassword(f.terminal);
    const bytes = Buffer.from(arabic);
    await feed(f.input, [
      bytes.subarray(0, 1),
      bytes.subarray(1),
      "😀",
      "\u007f",
      "x",
      "\b",
      "\r",
      arabic + "\r",
    ]);
    assert.equal(await pending, arabic);
    assert.equal(f.display().includes(arabic), false);
  } finally {
    f.terminal.close();
  }
});
test("repeated prompts and repeated sessions do not lose input or retain listeners", async () => {
  const f = fixture();
  try {
    const first = f.terminal.read("First: ");
    await feed(f.input, [
      password + "\r\nsecond-synthetic\r\nthird-synthetic\r\n",
    ]);
    assert.equal(await first, password);
    assert.equal(await f.terminal.read("Second: "), "second-synthetic");
    assert.equal(await f.terminal.read("Third: "), "third-synthetic");
  } finally {
    f.terminal.close();
  }
  assert.equal(f.input.listenerCount("data"), 0);
  const second = new HiddenTerminal(f.input, f.output);
  try {
    const pending = second.read("Again: ");
    await feed(f.input, [password + "\r"]);
    assert.equal(await pending, password);
  } finally {
    second.close();
  }
  assert.equal(f.input.listenerCount("data"), 0);
});
test("safe categories distinguish cancellation, EOF, control sequences, multiline paste and length", async () => {
  for (const [input, code] of [
    ["\u0003", "INPUT_CANCELLED"],
    ["\x1b[A", "INPUT_CONTROL"],
    ["\x1b[200~one\ntwo", "INPUT_MULTILINE"],
    ["a".repeat(129), "PASSWORD_TOO_LONG"],
  ]) {
    const f = fixture();
    try {
      const pending = assert.rejects(f.terminal.read("Hidden: "), { code });
      await feed(f.input, [input]);
      await pending;
    } finally {
      f.terminal.close();
    }
  }
  const f = fixture();
  try {
    const pending = assert.rejects(f.terminal.read("Hidden: "), {
      code: "INPUT_EOF",
    });
    f.input.end();
    await pending;
  } finally {
    f.terminal.close();
  }
});
test("policy and real mismatch are distinct errors, not assumed input failures", async () => {
  for (const [parts, code] of [
    [["short\r"], "PASSWORD_POLICY"],
    [[password + "\r", "different-synthetic-password\r"], "PASSWORD_MISMATCH"],
  ] as [string[], string][]) {
    const f = fixture();
    try {
      const pending = assert.rejects(readConfirmedPassword(f.terminal), {
        code,
      });
      await feed(f.input, parts);
      await pending;
    } finally {
      f.terminal.close();
    }
  }
  const privateMessage = "never-display-this-synthetic-value";
  assert.equal(
    safeSetupError(new Error(privateMessage)).includes(privateMessage),
    false,
  );
  assert.match(
    safeSetupError(new SetupError("OUTPUT_WRITE")),
    /\[OUTPUT_WRITE\]/,
  );
});
test("output uses private modes outside checkout and rejects symlinked repository homes", async () => {
  const root = await mkdtemp(join(tmpdir(), "madar-synthetic-output-"));
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const values = {
    MADAR_OWNER_PASSWORD_HASH: "synthetic-not-a-secret",
    MADAR_SESSION_SECRET: "synthetic-not-a-secret",
    MADAR_STORE_ENCRYPTION_KEY: "synthetic-not-a-secret",
  };
  try {
    const directory = await writePrivateOutput(root, repository, values);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await readdir(directory)).length, 3);
    for (const [name, value] of Object.entries(values)) {
      assert.equal((await stat(join(directory, name))).mode & 0o777, 0o600);
      assert.equal(await readFile(join(directory, name), "utf8"), value);
    }
    const duplicate = await writePrivateOutput(root, repository, values);
    assert.notEqual(directory, duplicate);
    const repoHome = join(root, "home-inside-repo");
    await mkdir(repoHome);
    const link = join(root, "linked-home");
    await symlink(repoHome, link);
    await assert.rejects(() => writePrivateOutput(link, root, values), {
      code: "OUTPUT_IN_REPOSITORY",
    });
    await assert.rejects(
      () =>
        writePrivateOutput(join(root, "does-not-exist"), repository, values),
      { code: "OUTPUT_WRITE" },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real POSIX PTY input, paste, cancellation and private output pass without echoed values", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    "python3",
    ["tests/owner-terminal-pty.py", process.execPath],
    { encoding: "utf8", timeout: 120000 },
  );
  // Do not attach captured output to assertions; test fixtures never print secret values.
  assert.equal(result.status, 0, "Real PTY regression checks must pass");
  assert.match(result.stdout, /PASS: 9 real PTY scenarios/);
});
