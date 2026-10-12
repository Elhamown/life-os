// Test-only PTY fixture. Never uses production randomness, providers or credentials.
import { homedir } from "node:os";
import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HiddenTerminal,
  readConfirmedPassword,
  createSecretValues,
  writePrivateOutput,
  safeSetupError,
} from "../../scripts/setup-owner-secrets.mjs";
let terminal;
try {
  terminal = new HiddenTerminal();
  let password = await readConfirmedPassword(terminal);
  terminal.close();
  let calls = 0;
  const values = createSecretValues(password, (size) =>
    Buffer.alloc(size, ++calls),
  );
  password = "";
  const directory = await writePrivateOutput(
    homedir(),
    fileURLToPath(new URL("../../", import.meta.url)),
    values,
  );
  let privateModes = ((await stat(directory)).mode & 0o777) === 0o700;
  let matches = true;
  for (const [name, value] of Object.entries(values)) {
    privateModes &&=
      ((await stat(join(directory, name))).mode & 0o777) === 0o600;
    matches &&= (await readFile(join(directory, name), "utf8")) === value;
  }
  console.log(
    JSON.stringify({
      ok: true,
      privateModes,
      matches,
      syntheticEntropyCalls: calls,
    }),
  );
} catch (error) {
  terminal?.close();
  process.stderr.write(safeSetupError(error));
  process.exitCode = 1;
}
