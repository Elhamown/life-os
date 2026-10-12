import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const defaultRoot = new URL("../app/fonts/", import.meta.url);
export function inspectFont(bytes) {
  if (bytes.length < 12 || bytes.readUInt32BE(0) !== 0x00010000)
    throw Error("Invalid TrueType font");
  const tables = new Map();
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    const offset = bytes.readUInt32BE(at + 8),
      length = bytes.readUInt32BE(at + 12);
    if (offset + length > bytes.length) throw Error("Truncated font table");
    tables.set(
      bytes.toString("ascii", at, at + 4),
      bytes.subarray(offset, offset + length),
    );
  }
  const cmap = tables.get("cmap"),
    os = tables.get("OS/2");
  if (!cmap || !os) throw Error("Missing cmap or OS/2 table");
  const covered = new Set();
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const at = cmap.readUInt32BE(8 + i * 8),
      format = cmap.readUInt16BE(at);
    if (format === 4) {
      const count = cmap.readUInt16BE(at + 6) / 2;
      const end = at + 14,
        start = end + count * 2 + 2,
        delta = start + count * 2,
        offsets = delta + count * 2;
      for (let s = 0; s < count; s++)
        for (
          let cp = cmap.readUInt16BE(start + s * 2);
          cp <= cmap.readUInt16BE(end + s * 2) && cp < 65535;
          cp++
        ) {
          const shift = cmap.readInt16BE(delta + s * 2),
            range = cmap.readUInt16BE(offsets + s * 2);
          const glyphAt =
            offsets +
            s * 2 +
            range +
            (cp - cmap.readUInt16BE(start + s * 2)) * 2;
          const glyph = range
            ? cmap.readUInt16BE(glyphAt)
            : (cp + shift) & 65535;
          if (glyph && (!range || (glyph + shift) & 65535)) covered.add(cp);
        }
    } else if (format === 12) {
      for (let g = 0; g < cmap.readUInt32BE(at + 12); g++) {
        const pos = at + 16 + g * 12,
          first = cmap.readUInt32BE(pos),
          last = cmap.readUInt32BE(pos + 4),
          glyph = cmap.readUInt32BE(pos + 8);
        for (let cp = first; cp <= last; cp++)
          if (glyph + cp - first) covered.add(cp);
      }
    }
  }
  return {
    weight: os.readUInt16BE(4),
    fsType: os.readUInt16BE(8),
    covered,
    shaping: tables.has("GSUB") && tables.has("GPOS"),
  };
}
export async function checkLicensedFonts(root = defaultRoot) {
  const audit = JSON.parse(
    await readFile(new URL("../docs/font-audit.json", import.meta.url), "utf8"),
  );
  for (const entry of audit) {
    const bytes = await readFile(new URL(entry.file, root));
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      throw Error("Original font checksum changed: " + entry.file);
    const font = inspectFont(bytes);
    if (font.weight !== entry.weight || font.fsType !== entry.fsType)
      throw Error("Font metadata changed");
    if (entry.file !== "Neo_Sans_Medium.ttf") {
      for (const cp of [
        ...Array.from({ length: 26 }, (_, i) => 0x621 + i),
        ...Array.from({ length: 18 }, (_, i) => 0x641 + i),
        ...Array.from({ length: 10 }, (_, i) => 0x660 + i),
      ])
        if (!font.covered.has(cp))
          throw Error("Missing Arabic glyph " + cp.toString(16));
      if (!font.shaping) throw Error("Missing Arabic shaping tables");
    } else if (font.covered.has(0x627))
      throw Error(
        "Reaudit replacement Medium before activating Arabic weight 500",
      );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await checkLicensedFonts();
  console.log(
    "Four original font checksums and Arabic coverage verified. Arabic Medium is unavailable; using real Light/Bold/Black weights.",
  );
}
