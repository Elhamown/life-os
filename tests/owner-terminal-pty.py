"""Real POSIX PTY regression checks, using only known synthetic test credentials.
Run: python3 tests/owner-terminal-pty.py /absolute/path/to/node
No captured terminal text, passwords, hashes or keys are printed.
"""
import os
import pty
import select
import subprocess
import sys
import tempfile
import time
from pathlib import Path

NODE = sys.argv[1]
ROOT = Path(__file__).resolve().parent.parent
PASSWORD = b"synthetic-test-password-only"

def check(scenario):
    with tempfile.TemporaryDirectory(prefix="madar-synthetic-pty-") as home:
        master, slave = pty.openpty()
        env = {**os.environ, "HOME": home}
        diagnostic = scenario.startswith("diagnose-")
        command = [NODE, str(ROOT / "scripts/setup-owner-secrets.mjs"), "--diagnose-input"] if diagnostic else [NODE, str(ROOT / "tests/fixtures/owner-terminal.mjs")]
        child = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, cwd=ROOT, env=env)
        os.close(slave)
        captured = bytearray()
        def read_until(marker):
            deadline = time.monotonic() + 15
            while marker not in captured:
                if time.monotonic() > deadline:
                    raise AssertionError("PTY response timeout: " + scenario)
                if select.select([master], [], [], 0.05)[0]:
                    try:
                        data = os.read(master, 4096)
                    except OSError:
                        break
                    if not data:
                        break
                    captured.extend(data)
                elif child.poll() is not None:
                    break
            if marker not in captured:
                raise AssertionError("Expected safe PTY result not received: " + scenario)
        def send(data):
            os.write(master, data)
        try:
            read_until(b"Input length check" if diagnostic else b"Choose owner password")
            if diagnostic:
                if scenario == "diagnose-startup":
                    send(b"\r\n")
                    time.sleep(0.01)
                typed = b"X" * (15 if scenario == "diagnose-short" else 32)
                for byte in typed:
                    send(bytes([byte]))
                    time.sleep(0.001)
                send(b"\r")
            elif scenario == "typing":
                for byte in PASSWORD:
                    send(bytes([byte]))
                    time.sleep(0.001)
                send(b"\r")
                read_until(b"Confirm password")
                send(PASSWORD + b"\r")
            elif scenario == "split-crlf":
                send(PASSWORD + b"\r")
                read_until(b"Confirm password")
                send(b"\n")
                time.sleep(0.01)
                send(PASSWORD + b"\r\n")
            elif scenario == "coalesced-paste":
                send(PASSWORD + b"\r\n" + PASSWORD + b"\r\n")
            elif scenario == "bracketed-paste":
                for part in [b"\x1b[", b"200~", PASSWORD, b"\x1b[20", b"1~\r"]:
                    send(part)
                    time.sleep(0.002)
                read_until(b"Confirm password")
                send(b"\x1b[200~" + PASSWORD + b"\x1b[201~\r")
            elif scenario == "backspace-unicode":
                arabic = "كلمة-اختبار-اصطناعية-فقط".encode("utf-8")
                send(arabic[:1]); time.sleep(0.002)
                send(arabic[1:] + "😀".encode("utf-8") + b"\x7fx\x08\r")
                read_until(b"Confirm password")
                send(arabic + b"\r")
            elif scenario == "cancel":
                send(b"\x03")
            elif scenario == "policy":
                send(b"short\r")
            elif scenario == "mismatch":
                send(PASSWORD + b"\r")
                read_until(b"Confirm password")
                send(b"different-synthetic-password\r")
            errors = {"cancel": b"[INPUT_CANCELLED]", "policy": b"[PASSWORD_POLICY]", "mismatch": b"[PASSWORD_MISMATCH]"}
            if diagnostic:
                passed = scenario != "diagnose-short"
                marker = b'{"characters":32,"utf8Bytes":32,"validationPassed":true}' if passed else b'{"characters":15,"utf8Bytes":15,"validationPassed":false}'
                read_until(marker)
                child.wait(timeout=5)
                if child.returncode != (0 if passed else 1) or list(Path(home).iterdir()) or b"X"*15 in captured:
                    raise AssertionError("Diagnostic was not private and side-effect free: " + scenario)
            elif scenario in errors:
                read_until(errors[scenario])
                child.wait(timeout=5)
                if child.returncode != 1 or list(Path(home).iterdir()):
                    raise AssertionError("Failure did not stop safely: " + scenario)
            else:
                read_until(b'"ok":true,"privateModes":true,"matches":true,"syntheticEntropyCalls":3')
                child.wait(timeout=5)
                if child.returncode != 0:
                    raise AssertionError("Unexpected PTY exit: " + scenario)
            if PASSWORD in captured or b"scrypt$" in captured or "كلمة-اختبار-اصطناعية-فقط".encode() in captured:
                raise AssertionError("Synthetic secret was echoed: " + scenario)
            if b"\x1b[?2004l" not in captured:
                raise AssertionError("Paste mode was not restored: " + scenario)
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
            os.close(master)

for scenario in ["typing", "split-crlf", "coalesced-paste", "bracketed-paste", "backspace-unicode", "cancel", "policy", "mismatch", "typing", "diagnose-32", "diagnose-startup", "diagnose-short"]:
    check(scenario)
print("PASS: 12 real PTY scenarios; synthetic entropy only; no password/key output; private modes verified.")
