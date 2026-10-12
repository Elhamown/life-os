import "server-only";

// Optional, local web embedding. No copyrighted font binaries are bundled.
export const neoSansCss = [
  ["regular", 400],
  ["medium", 500],
  ["bold", 700],
]
  .map(
    ([file, weight]) =>
      `@font-face{font-family:"Neo Sans Arabic";src:url("/fonts/neo-sans-arabic/${file}.woff2") format("woff2");font-weight:${weight};font-style:normal;font-display:swap;}`,
  )
  .join("\n");
